// Copyright 2010-2014 RethinkDB, all rights reserved.
#include "btree/backfill.hpp"

#include <algorithm>

#include "arch/runtime/coroutines.hpp"
#include "btree/node.hpp"
#include "btree/internal_node.hpp"
#include "btree/leaf_node.hpp"
#include "btree/parallel_traversal.hpp"
#include "btree/secondary_operations.hpp"
#include "buffer_cache/alt.hpp"

struct backfill_traversal_helper_t : public btree_traversal_helper_t, public home_thread_mixin_debug_only_t {
    void process_a_leaf(buf_lock_t *leaf_node_buf,
                        const btree_key_t *left_exclusive_or_null,
                        const btree_key_t *right_inclusive_or_null,
                        signal_t *interruptor,
                        int * /*population_change_out*/)
        THROWS_ONLY(interrupted_exc_t) {
        assert_thread();
        buf_read_t read(leaf_node_buf);
        sized_ptr_t<const leaf_node_t> data = read.get_sized_data_read<leaf_node_t>();

        key_range_t clipped_range(
            left_exclusive_or_null ? key_range_t::open : key_range_t::none,
            left_exclusive_or_null ? store_key_t(left_exclusive_or_null) : store_key_t(),
            right_inclusive_or_null ? key_range_t::closed : key_range_t::none,
            right_inclusive_or_null ? store_key_t(right_inclusive_or_null) : store_key_t());
        clipped_range = clipped_range.intersection(key_range_);

        std::vector<leaf::entry_ptrs_t> kvts;
        const bool exact = leaf::dump_entries_since_time(sizer_, data, since_when_, leaf_node_buf->get_recency(), &kvts);

        if (!exact) {
            callback_->on_delete_range(clipped_range, interruptor);
        }

        std::vector<const btree_key_t *> filtered_keys;
        std::vector<const void *> filtered_values;
        std::vector<repli_timestamp_t> filtered_tstamps;
        filtered_keys.reserve(kvts.size());
        filtered_values.reserve(kvts.size());
        filtered_tstamps.reserve(kvts.size());
        for (const leaf::entry_ptrs_t &kvt : kvts) {
            if (clipped_range.contains_key(kvt.key->contents, kvt.key->size)) {
                if (kvt.value_or_null != nullptr) {
                    filtered_keys.push_back(kvt.key);
                    filtered_values.push_back(kvt.value_or_null);
                    filtered_tstamps.push_back(kvt.tstamp);
                } else {
                    rassert(exact);
                    callback_->on_deletion(kvt.key, kvt.tstamp, interruptor);
                }
            }
        }

        if (!filtered_keys.empty()) {
            callback_->on_pairs(buf_parent_t(leaf_node_buf), filtered_tstamps, filtered_keys,
                                filtered_values, interruptor);
        }
    }

    void postprocess_internal_node(UNUSED buf_lock_t *internal_node_buf) {
        assert_thread();
        // do nothing
    }

    access_t btree_superblock_mode() { return access_t::read; }
    access_t btree_node_mode() { return access_t::read; }

    void filter_interesting_children(buf_parent_t parent,
                                     ranged_block_ids_t *ids_source,
                                     interesting_children_callback_t *cb) {
        assert_thread();

        int num_block_ids = ids_source->num_block_ids();
        for (int i = 0; i < num_block_ids; ++i) {
            const btree_key_t *left, *right;
            block_id_t id;
            ids_source->get_block_id_and_bounding_interval(i, &id, &left, &right);
            if (overlaps(left, right, key_range_.left, key_range_.right)) {
                repli_timestamp_t recency;
                {
                    buf_lock_t lock(parent, id, access_t::read);
                    recency = lock.get_recency();
                }
                if (recency >= since_when_) {
                    cb->receive_interesting_child(i);
                }
            }
        }
        cb->no_more_interesting_children();
    }

    // Checks if (x_left, x_right] intersects [y_left, y_right).  If
    // it returns false, the intersection may be non-empty.
    static bool overlaps(const btree_key_t *x_left, const btree_key_t *x_right,
                         const store_key_t& y_left, const key_range_t::right_bound_t& y_right) {
        // Does (x_left, x_right] intersects [y_left, y_right)?

        // For real numbers, if x_left < y_right and x_right >=
        // y_left, we have overlap.  However, for integers, consider
        // the case where x_left + 1 == y_right.  Then we don't have
        // overlap.  Our keys are like integers.

        if (!(x_right == NULL || sized_strcmp(y_left.contents(), y_left.size(), x_right->contents, x_right->size) <= 0)) {
            return false;
        }

        if (x_left == NULL || y_right.unbounded) {
            return true;
        } else {
            store_key_t x_left_copy(x_left->size, x_left->contents);
            if (!x_left_copy.increment()) {
                return false;
            }

            // Now it's [x_left_copy, x_right] intersecting [y_left, y_right).
            return sized_strcmp(x_left_copy.contents(), x_left_copy.size(), y_right.key.contents(), y_right.key.size()) < 0;
        }
    }


    agnostic_backfill_callback_t *callback_;
    repli_timestamp_t since_when_;
    value_sizer_t *sizer_;
    const key_range_t& key_range_;

    backfill_traversal_helper_t(agnostic_backfill_callback_t *callback, repli_timestamp_t since_when,
                                value_sizer_t *sizer, const key_range_t& key_range)
        : callback_(callback), since_when_(since_when), sizer_(sizer), key_range_(key_range) { }
};

void do_agnostic_btree_backfill(value_sizer_t *sizer,
                                const key_range_t &key_range,
                                repli_timestamp_t since_when,
                                agnostic_backfill_callback_t *callback,
                                superblock_t *superblock,
                                buf_lock_t *sindex_block,
                                parallel_traversal_progress_t *p,
                                signal_t *interruptor)
        THROWS_ONLY(interrupted_exc_t) {
    rassert(coro_t::self());

    std::map<sindex_name_t, secondary_index_t> sindexes;
    get_secondary_indexes(sindex_block, &sindexes);
    std::map<std::string, secondary_index_t> live_sindexes;
    for (auto it = sindexes.begin(); it != sindexes.end(); ++it) {
        if (!it->second.being_deleted) {
            guarantee(!it->first.being_deleted);
            auto res = live_sindexes.insert(std::make_pair(it->first.name, it->second));
            guarantee(res.second);
        }
    }
    callback->on_sindexes(live_sindexes, interruptor);

    backfill_traversal_helper_t helper(callback, since_when, sizer, key_range);
    helper.progress = p;
    btree_parallel_traversal(superblock, &helper, interruptor);
}
