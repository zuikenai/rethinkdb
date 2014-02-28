// Copyright 2010-2014 RethinkDB, all rights reserved.
#include "btree/tree_validation.hpp"

#include "buffer_cache/alt/alt.hpp"
#include "btree/leaf_node.hpp"
#include "btree/internal_node.hpp"
#include "btree/node.hpp"
#include "btree/parallel_traversal.hpp"
#include "btree/slice.hpp"
#include "concurrency/fifo_checker.hpp"

class validate_tree_helper_t : public btree_traversal_helper_t {
public:
    explicit validate_tree_helper_t(value_sizer_t<void> *_sizer)
        : sizer(_sizer)
    { }

    void process_a_leaf(buf_lock_t *leaf_node_buf,
                        const btree_key_t *l_excl,
                        const btree_key_t *r_incl,
                        signal_t *,
                        int *population_change_out) THROWS_ONLY(interrupted_exc_t) {
        buf_read_t read(leaf_node_buf);
        const leaf_node_t *node = static_cast<const leaf_node_t *>(read.get_data_read());
        if (sizer != NULL) {
            leaf::validate(sizer, node);
        }

        for (auto it = leaf::begin(*node); it != leaf::end(*node); ++it) {
            const btree_key_t *k = (*it).first;
            if (!k) {
                break;
            }

            // k's in the leaf node so it should be in the range of
            // keys allowed for the leaf node.
            assert_key_in_range(k, l_excl, r_incl);
        }
        *population_change_out = 0;
    }

    void postprocess_internal_node(buf_lock_t *internal_node_buf) {
        buf_read_t read(internal_node_buf);
        uint32_t block_size;
        const internal_node_t *node = static_cast<const internal_node_t *>(read.get_data_read(&block_size));
        internal_node::validate(block_size_t::make_from_cache(block_size), node);
    }

    void filter_interesting_children(buf_parent_t,
                                     ranged_block_ids_t *ids_source,
                                     interesting_children_callback_t *cb) {
        for (int i = 0, e = ids_source->num_block_ids(); i < e; ++i) {
                cb->receive_interesting_child(i);
        }

        cb->no_more_interesting_children();
    }

    access_t btree_superblock_mode() { return access_t::write; }
    access_t btree_node_mode() { return access_t::write; }

    ~validate_tree_helper_t() { }

    static bool key_in_range(const btree_key_t *k, const btree_key_t *left_excl, const btree_key_t *right_incl) {
        if (left_excl != NULL && sized_strcmp(k->contents, k->size, left_excl->contents, left_excl->size) <= 0) {
            return false;
        }
        if (right_incl != NULL && sized_strcmp(right_incl->contents, right_incl->size, k->contents, k->size) < 0) {
            return false;
        }
        return true;
    }

    static void assert_key_in_range(const btree_key_t *k, const btree_key_t *left_excl, const btree_key_t *right_incl) {
        if (!key_in_range(k, left_excl, right_incl)) {
            printf_buffer_t buf;
            buf.appendf("Key out of range:\n");
            std::string k_str((char *)&k->contents, (size_t)k->size);
            buf.appendf("k: %s\n", k_str.c_str());
            std::string left_excl_str((char *)&left_excl->contents, (size_t)left_excl->size);
            buf.appendf("left_excl: %s\n", left_excl_str.c_str());
            std::string right_incl_str((char *)&right_incl->contents, (size_t)right_incl->size);
            buf.appendf("right_incl: %s\n", right_incl_str.c_str());
            fprintf(stderr, "%s", buf.c_str());
        }
    }

private:
    value_sizer_t<void> *sizer;

    DISABLE_COPYING(validate_tree_helper_t);
};

void validate_btree(value_sizer_t<void> *sizer, superblock_t *superblock) {
    validate_tree_helper_t helper(sizer);
    cond_t dummy_interruptor;
    btree_parallel_traversal(superblock, &helper, &dummy_interruptor,
                             false);
}
