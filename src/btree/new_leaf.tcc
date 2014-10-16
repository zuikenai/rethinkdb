#ifndef BTREE_NEW_LEAF_TCC_
#define BTREE_NEW_LEAF_TCC_
#include "btree/new_leaf.hpp"

#include <algorithm>
#include <vector>

#include "btree/keys.hpp"
#include "btree/leaf_structure.hpp"
#include "btree/main_btree.hpp"
#include "btree/node.hpp"
#include "buffer_cache/alt.hpp"
#include "containers/sized_ptr.hpp"
#include "serializer/buf_ptr.hpp"
#include "math.hpp"

// The byte value we use to wipe entries with.
#define ENTRY_WIPE_CODE 0

// There is no instantiation for entry_t anywhere.
namespace new_leaf {

struct entry_t;

// This is less than old_leaf::DELETION_RESERVE_FRACTION, which is 10, because... (a)
// the number's kind of arbitrary, but also, now we try to keep the constraint
// dead_entry_size * DEAD_RESERVE_FRACTION <= live_entry_size, as close to equality
// as possible, instead of keeping the constraint deleted_entry_size *
// DELETION_RESERVE_FRACTION >= live_entry_size.  So it makes sense to have a smaller
// proportion.
const int DEAD_RESERVE_FRACTION = 7;


inline size_t pair_offsets_back_offset(int num_pairs) {
    return offsetof(main_leaf_node_t, pair_offsets) + num_pairs * sizeof(uint16_t);
}

inline const entry_t *get_entry(const main_leaf_node_t *node, size_t offset) {
    rassert(offset >= pair_offsets_back_offset(node->num_pairs));
    return reinterpret_cast<const entry_t *>(reinterpret_cast<const char *>(node) + offset);
}

inline const entry_t *get_entry(sized_ptr_t<const main_leaf_node_t> node, size_t offset) {
    rassert(offset >= pair_offsets_back_offset(node.buf->num_pairs));
    return get_entry(node.buf, offset);
}

inline entry_t *get_entry(main_leaf_node_t *node, size_t offset) {
    const main_leaf_node_t *const_node = node;
    return const_cast<entry_t *>(get_entry(const_node, offset));
}

inline entry_t *get_entry(sized_ptr_t<main_leaf_node_t> node, size_t offset) {
    return const_cast<entry_t *>(get_entry(sized_ptr_t<const main_leaf_node_t>(node), offset));
}

inline const entry_t *entry_for_index(sized_ptr_t<const main_leaf_node_t> node, int index) {
    rassert(index >= 0 && index < node.buf->num_pairs);
    return get_entry(node, node.buf->pair_offsets[index]);
}

inline entry_t *entry_for_index(sized_ptr_t<main_leaf_node_t> node, int index) {
    return const_cast<entry_t *>(entry_for_index(sized_ptr_t<const main_leaf_node_t>(node), index));
}

inline bool dead_entry_size_too_big(size_t live_entry_size, size_t dead_entry_size) {
    return live_entry_size < dead_entry_size * DEAD_RESERVE_FRACTION;
}

template <class btree_type>
void add_entry_size_change(main_leaf_node_t *node,
                           const entry_t *entry,
                           size_t entry_size) {
    if (btree_type::is_live(entry)) {
        node->live_entry_size += entry_size + sizeof(uint16_t);
    } else {
        node->dead_entry_size += entry_size + sizeof(uint16_t);
    }
}

template <class btree_type>
void subtract_entry_size_change(main_leaf_node_t *node,
                                const entry_t *entry,
                                size_t entry_size) {
    if (btree_type::is_live(entry)) {
        node->live_entry_size -= entry_size + sizeof(uint16_t);
    } else {
        node->dead_entry_size -= entry_size + sizeof(uint16_t);
    }
}


template <class btree_type>
buf_ptr_t new_leaf_t<btree_type>::init() {
    static_assert(sizeof(main_leaf_node_t) == offsetof(main_leaf_node_t, pair_offsets),
                  "Weird main_leaf_node_t packing.");
    buf_ptr_t ret = buf_ptr_t::alloc_uninitialized(
            block_size_t::make_from_cache(sizeof(main_leaf_node_t)));
    main_leaf_node_t *p = static_cast<main_leaf_node_t *>(ret.cache_data());
    p->magic = main_leaf_node_t::expected_magic;
    p->num_pairs = 0;
    p->live_entry_size = 0;
    p->dead_entry_size = 0;
    p->frontmost = offsetof(main_leaf_node_t, pair_offsets);
    p->partial_replicability_age = repli_timestamp_t::distant_past;
    return ret;
}


// Sets *index_out to the index for the live entry or deletion entry
// for the key, or to the index the key would have if it were
// inserted.  Returns true if the key at said index is actually equal.
template <class btree_type>
bool new_leaf_t<btree_type>::find_key(
        sized_ptr_t<const main_leaf_node_t> node,
        const btree_key_t *key,
        int *index_out) {
    int beg = 0;
    int end = node.buf->num_pairs;

    // beg == 0 or key > *(beg - 1).
    // end == num_pairs or key < *end.

    while (beg < end) {
        // when (end - beg) > 0, (end - beg) / 2 is always less than (end - beg).  So beg <= test_point < end.
        int test_point = beg + (end - beg) / 2;

        int res = btree_type::compare_key_to_entry(key, entry_for_index(node, test_point));

        if (res < 0) {
            // key < *test_point.
            end = test_point;
        } else if (res > 0) {
            // key > *test_point.  Since test_point < end, we have test_point + 1 <= end.
            beg = test_point + 1;
        } else {
            // We found the key!
            *index_out = test_point;
            return true;
        }
    }

    // (Since beg == end, then *(beg - 1) < key < *beg (with appropriate
    // provisions for beg == 0 or beg == num_pairs) and index_out
    // should be set to beg, and false should be returned.
    *index_out = beg;
    return false;
}

inline size_t node_cost(const main_leaf_node_t *node) {
    return node->live_entry_size + node->dead_entry_size;
}

inline size_t used_size_for_cost(size_t cost) {
    return offsetof(main_leaf_node_t, pair_offsets) + cost;
}

inline size_t used_size(const main_leaf_node_t *node) {
    return used_size_for_cost(node_cost(node));
}

template <class btree_type>
MUST_USE size_t make_entries_contiguous(default_block_size_t bs, sized_ptr_t<main_leaf_node_t> node) {
#ifndef NDEBUG
    const size_t used = used_size(node.buf);
#endif

    // We sort offset/index pairs by offset.
    std::vector<std::pair<uint16_t, uint16_t> > offset_and_indexes;
    offset_and_indexes.reserve(node.buf->num_pairs);

    for (size_t i = 0, e = node.buf->num_pairs; i < e; ++i) {
        offset_and_indexes.push_back(std::make_pair(node.buf->pair_offsets[i], i));
    }

    std::sort(offset_and_indexes.begin(), offset_and_indexes.end());

    // Now we walk through the entries from left to right and move them.

    size_t write_offset = pair_offsets_back_offset(node.buf->num_pairs);
    for (const std::pair<uint16_t, uint16_t> &pair : offset_and_indexes) {
        const entry_t *entry = get_entry(node, pair.first);
        const size_t entry_size = btree_type::entry_size(bs, entry);
        memmove(get_entry(node, write_offset),
                entry,
                entry_size);
        node.buf->pair_offsets[pair.second] = write_offset;
        write_offset += entry_size;
    }

    rassert(write_offset == used);

    return write_offset;
}

template <class btree_type>
void compactify_for_space(default_block_size_t bs, buf_write_t *buf) {
    size_t used = make_entries_contiguous<btree_type>(bs, buf->get_sized_data_write<main_leaf_node_t>());
    sized_ptr_t<main_leaf_node_t> node = buf->resize<main_leaf_node_t>(used);
    new_leaf_t<btree_type>::validate(bs, node);
}

template <class btree_type>
void maybe_compactify_for_space(default_block_size_t bs, buf_write_t *buf) {
    sized_ptr_t<main_leaf_node_t> node = buf->get_sized_data_write<main_leaf_node_t>();
    size_t used = used_size(node.buf);

    if (block_size_t::make_from_cache(used).device_block_count() < block_size_t::make_from_cache(node.block_size).device_block_count()) {
        compactify_for_space<btree_type>(bs, buf);
    }
}

namespace {

void recompute_frontmost(sized_ptr_t<main_leaf_node_t> node) {
    uint16_t frontmost = node.block_size;
    for (uint16_t i = 0, e = node.buf->num_pairs; i < e; ++i) {
        frontmost = std::min(frontmost, node.buf->pair_offsets[i]);
    }
    node.buf->frontmost = frontmost;
}

}  // namespace

// Removes entries that are older than partial_replicability_age (because we just
// increased its value).  Touches frontmost and num_pairs.
template <class btree_type>
void remove_too_old_dead_entries(default_block_size_t bs,
                                 sized_ptr_t<main_leaf_node_t> node) {
    const repli_timestamp_t cutoff = node.buf->partial_replicability_age;
    size_t w = 0;
    uint16_t new_frontmost = node.block_size;
    for (size_t i = 0, e = node.buf->num_pairs; i < e; ++i) {
        const uint16_t offset = node.buf->pair_offsets[i];
        node.buf->pair_offsets[w] = offset;
        entry_t *entry = get_entry(node, offset);
        if (!btree_type::is_live(entry) && btree_type::entry_timestamp(entry) < cutoff) {
            const size_t entry_size = btree_type::entry_size(bs, entry);
            subtract_entry_size_change<btree_type>(node.buf, entry, entry_size);
            memset(entry, ENTRY_WIPE_CODE, entry_size);
        } else {
            new_frontmost = std::min<uint16_t>(new_frontmost, offset);
            ++w;
        }
    }

    memset(node.buf->pair_offsets + w, ENTRY_WIPE_CODE, (node.buf->num_pairs - w) * sizeof(uint16_t));
    node.buf->num_pairs = w;
    node.buf->frontmost = new_frontmost;
}


template <class btree_type>
void remove_excess_deads_and_compactify(default_block_size_t bs, buf_write_t *buf) {
    sized_ptr_t<main_leaf_node_t> node = buf->get_sized_data_write<main_leaf_node_t>();

    std::vector<std::pair<repli_timestamp_t, int> > dead_entry_indices;
    dead_entry_indices.reserve(node.buf->num_pairs);

    for (int i = 0, e = node.buf->num_pairs; i < e; ++i) {
        const entry_t *entry = entry_for_index(node, i);
        if (!btree_type::is_live(entry)) {
            dead_entry_indices.push_back(std::make_pair(btree_type::entry_timestamp(entry), i));
        }
    }

    std::sort(dead_entry_indices.begin(), dead_entry_indices.end());

    size_t cumulative_size = 0;
    size_t cutoff_index = dead_entry_indices.size();
    for (size_t i = 0; i < dead_entry_indices.size(); ++i) {
        size_t next_cumulative_size = cumulative_size + btree_type::entry_size(bs, entry_for_index(node, dead_entry_indices[i].second));
        if (dead_entry_size_too_big(node.buf->live_entry_size, next_cumulative_size)) {
            cutoff_index = i;
            break;
        }

        cumulative_size = next_cumulative_size;
    }

    // This is called by compactify after asserting that there are too many dead
    // entries.  So some of them should be chopped off.
    rassert(cutoff_index < dead_entry_indices.size());

    if (cutoff_index < dead_entry_indices.size()) {
        // The timestamp _after_ the first clipped dead entry is the timestamp from
        // which point the leaf node is up-to-date.  (Because they're sorted, it's
        // the maximum of the clipped timestamps.)

        node.buf->partial_replicability_age
            = dead_entry_indices[cutoff_index].first.next();
    }

    // Now let's remove the dead entries.
    remove_too_old_dead_entries<btree_type>(bs, node);

    new_leaf_t<btree_type>::validate(bs, node);
    maybe_compactify_for_space<btree_type>(bs, buf);
}

template <class btree_type>
MUST_USE sized_ptr_t<main_leaf_node_t>
compactify(default_block_size_t bs, buf_write_t *buf) {
    sized_ptr_t<main_leaf_node_t> node = buf->get_sized_data_write<main_leaf_node_t>();
    new_leaf_t<btree_type>::validate(bs, node);

    // First, we want to ask:  Can we drop some dead entries?
    if (dead_entry_size_too_big(node.buf->live_entry_size, node.buf->dead_entry_size)) {
        remove_excess_deads_and_compactify<btree_type>(bs, buf);
    } else {
        maybe_compactify_for_space<btree_type>(bs, buf);
    }
    return buf->get_sized_data_write<main_leaf_node_t>();
}

// This doesn't call compactify, which you might want to do.
template <class btree_type>
void remove_entry_for_index(default_block_size_t bs,
                            sized_ptr_t<main_leaf_node_t> node,
                            int index) {
    rassert(0 <= index && index < node.buf->num_pairs);
    const size_t entry_offset = node.buf->pair_offsets[index];
    const entry_t *entry = get_entry(node, entry_offset);
    const size_t entry_size = btree_type::entry_size(bs, entry);

    subtract_entry_size_change<btree_type>(node.buf, entry, entry_size);
    memmove(node.buf->pair_offsets + index, node.buf->pair_offsets + index + 1,
            (node.buf->num_pairs - (index + 1)) * sizeof(uint16_t));
    memset(get_entry(node, entry_offset), ENTRY_WIPE_CODE, entry_size);
    memset(node.buf->pair_offsets + (node.buf->num_pairs - 1), ENTRY_WIPE_CODE, sizeof(uint16_t));
    node.buf->num_pairs -= 1;
    if (entry_offset == node.buf->frontmost) {
        recompute_frontmost(node);
    }
}

// Invalidates old buf pointers that were returned by get_sized_data_write -- either
// call get_sized_data_write again, or use this return value.
template <class btree_type>
MUST_USE sized_ptr_t<main_leaf_node_t>
make_gap_in_pair_offsets(default_block_size_t bs, buf_write_t *buf, int index, int size) {
    sized_ptr_t<main_leaf_node_t> node = buf->get_sized_data_write<main_leaf_node_t>();
    rassert(0 <= index && index <= node.buf->num_pairs);
    const size_t new_num_pairs = node.buf->num_pairs + size;
    const size_t new_back = pair_offsets_back_offset(new_num_pairs);

    if (node.buf->num_pairs == 0) {
        node = buf->resize<main_leaf_node_t>(new_back);
        recompute_frontmost(node);
    } else {
        // Make room for us to make the gap.
        while (new_back > node.buf->frontmost) {
            int frontmost_index = -1;
            for (size_t i = 0, e = node.buf->num_pairs; i < e; ++i) {
                if (node.buf->pair_offsets[i] == node.buf->frontmost) {
                    frontmost_index = i;
                    break;
                }
            }

            rassert(frontmost_index != -1);

            entry_t *const entry = get_entry(node, node.buf->frontmost);
            const size_t entry_size = btree_type::entry_size(bs, entry);
            const size_t insertion_offset = std::max<size_t>(new_back, node.block_size);
            node = buf->resize<main_leaf_node_t>(insertion_offset + entry_size);
            memcpy(get_entry(node, insertion_offset), entry, entry_size);
            memset(entry, ENTRY_WIPE_CODE, entry_size);
            node.buf->pair_offsets[frontmost_index] = insertion_offset;

            recompute_frontmost(node);
        }
    }

    // Now make the gap.
    memmove(node.buf->pair_offsets + index + size,
            node.buf->pair_offsets + index,
            (node.buf->num_pairs - index) * sizeof(uint16_t));

    memset(node.buf->pair_offsets + index, 0, size * sizeof(uint16_t));
    node.buf->num_pairs = new_num_pairs;

    return node;
}

// Inserts an entry, possibly replacing the existing one for that key.
template <class btree_type>
void new_leaf_t<btree_type>::insert_entry(default_block_size_t bs,
                                          buf_write_t *buf,
                                          const void *v_entry) {
    const entry_t *entry = static_cast<const entry_t *>(v_entry);
    const size_t entry_size = btree_type::entry_size(bs, entry);
    const btree_key_t *const key = btree_type::entry_key(entry);

    sized_ptr_t<main_leaf_node_t> node = buf->get_sized_data_write<main_leaf_node_t>();

    int index;
    const bool found = find_key(node, key, &index);

    if (found) {
        remove_entry_for_index<btree_type>(bs, node, index);
    }

    node = make_gap_in_pair_offsets<btree_type>(bs, buf, index, 1);

    const size_t insertion_offset = node.block_size;
    node = buf->resize<main_leaf_node_t>(node.block_size + entry_size);
    memcpy(get_entry(node, insertion_offset), entry, entry_size);
    node.buf->pair_offsets[index] = insertion_offset;
    add_entry_size_change<btree_type>(node.buf, entry, entry_size);

    node = compactify<btree_type>(bs, buf);
}

// Removes an entry.  Asserts that the key is in the node.  TODO(2014-11): This means
// we're already sure the key is in the node, which means we're doing an unnecessary
// binary search.
template <class btree_type>
void new_leaf_t<btree_type>::erase_presence(default_block_size_t bs,
                                            buf_write_t *buf,
                                            const btree_key_t *key) {
    sized_ptr_t<main_leaf_node_t> node = buf->get_sized_data_write<main_leaf_node_t>();

    int index;
    const bool found = find_key(node, key, &index);
    guarantee(found);

    remove_entry_for_index<btree_type>(bs, node, index);
    node = compactify<btree_type>(bs, buf);
}

template <class btree_type>
bool new_leaf_t<btree_type>::lookup_entry(sized_ptr_t<const main_leaf_node_t> node,
                                          const btree_key_t *key,
                                          const void **entry_ptr_out) {
    int index;
    const bool found = find_key(node, key, &index);
    if (found) {
        *entry_ptr_out = get_entry(node, index);
        return true;
    } else {
        *entry_ptr_out = NULL;
        return false;
    }
}

template <class btree_type>
bool new_leaf_t<btree_type>::is_empty(sized_ptr_t<const main_leaf_node_t> node) {
    return node.buf->num_pairs == 0;
}

template <class btree_type>
bool new_leaf_t<btree_type>::is_full(default_block_size_t bs,
                                     const main_leaf_node_t *node,
                                     size_t entry_size) {
    return used_size(node) + entry_size + sizeof(uint16_t) > bs.value();
}

template <class btree_type>
bool new_leaf_t<btree_type>::is_underfull(default_block_size_t bs,
                                          const main_leaf_node_t *node) {
    // An underfull node is one whose mandatory fields' cost constitutes
    // significantly less than half the free space, where "significantly" is enough
    // to prevent really easy split-then-merge happenings.

    // We omit the fixed costs from the calculation.  Also, we multiple
    // max_entry_size by 1.5 to be extra hard about avoiding excessive
    // split-then-merge operations.  (It's somewhat more OK to do this now because we
    // no longer waste space _on_disk_ from having underfull entries.)
    const size_t free_space = bs.value() - offsetof(main_leaf_node_t, pair_offsets);
    const size_t max_entry_usage = sizeof(uint16_t) + btree_type::max_entry_size();
    return node->live_entry_size + node->dead_entry_size < free_space / 2 - (3 * max_entry_usage) / 2;
}

template <class btree_type>
void new_leaf_t<btree_type>::split(default_block_size_t bs,
                                   buf_write_t *buf,
                                   buf_ptr_t *rnode_out,
                                   store_key_t *median_out) {
    // We're just going to compute up front how big the sibling has to be.

    sized_ptr_t<main_leaf_node_t> node = buf->get_sized_data_write<main_leaf_node_t>();
    rassert(node.buf->num_pairs >= 2);

    const size_t total_cost = node.buf->live_entry_size + node.buf->dead_entry_size;

    size_t splitpoint = node.buf->num_pairs;
    size_t sib_cost = 0;
    while (splitpoint > 1) {
        size_t new_splitpoint = splitpoint - 1;
        size_t new_sib_cost = sib_cost + btree_type::entry_size(bs, entry_for_index(node, new_splitpoint)) + sizeof(uint16_t);

        if (new_sib_cost >= total_cost / 2) {
            break;
        }
        splitpoint = new_splitpoint;
        sib_cost = new_sib_cost;
    }

    rassert(splitpoint > 0 && splitpoint < node.buf->num_pairs);

    const size_t rnode_block_size = used_size_for_cost(sib_cost);

    buf_ptr_t rnode = buf_ptr_t::alloc_uninitialized(block_size_t::make_from_cache(rnode_block_size));
    main_leaf_node_t *rnode_ptr = static_cast<main_leaf_node_t *>(rnode.cache_data());
    const size_t rnode_num_pairs = node.buf->num_pairs - splitpoint;

    rnode_ptr->magic = main_leaf_node_t::expected_magic;
    rnode_ptr->num_pairs = rnode_num_pairs;
    rnode_ptr->partial_replicability_age = node.buf->partial_replicability_age;

    size_t write_offset = pair_offsets_back_offset(rnode_num_pairs);
    rnode_ptr->frontmost = write_offset;
    for (size_t i = 0; i < rnode_num_pairs; ++i) {
        entry_t *const node_entry = entry_for_index(node, splitpoint + i);
        const size_t entry_size = btree_type::entry_size(bs, node_entry);
        rassert(write_offset + entry_size <= rnode_block_size);
        memcpy(get_entry(rnode_ptr, write_offset), node_entry, entry_size);
        subtract_entry_size_change<btree_type>(node.buf, node_entry, entry_size);
        add_entry_size_change<btree_type>(rnode_ptr, node_entry, entry_size);
        memset(node_entry, ENTRY_WIPE_CODE, entry_size);
        rnode_ptr->pair_offsets[i] = write_offset;
        write_offset += entry_size;
    }

    // RSI: Compactify rnode.  The hypothetical problem is that excessively
    // many deletion entries could wind up in rnode.  That means it could have about
    // twice the acceptable density of deletion entries.  (Which is not the end of
    // the world.)

    validate(bs, sized_ptr_t<main_leaf_node_t>(rnode_ptr, rnode_block_size));

    node.buf->num_pairs = splitpoint;
    recompute_frontmost(node);
    node = compactify<btree_type>(bs, buf);

    *rnode_out = std::move(rnode);
    keycpy(median_out->btree_key(),
           btree_type::entry_key(entry_for_index(node, node.buf->num_pairs - 1)));
}

// Moves entries from sib into node.
template <class btree_type>
void move_entries(default_block_size_t bs,
                  buf_write_t *node_buf, size_t insert_point,
                  buf_write_t *sib_buf, size_t beg, size_t end,
                  std::vector<scoped_malloc_t<void> > *moved_live_entries_out) {
    sized_ptr_t<main_leaf_node_t> node = node_buf->get_sized_data_write<main_leaf_node_t>();
    sized_ptr_t<main_leaf_node_t> sib = sib_buf->get_sized_data_write<main_leaf_node_t>();

    node = make_gap_in_pair_offsets<btree_type>(bs, node_buf, insert_point, end - beg);

    size_t total_entry_size = 0;
    for (size_t i = 0; i < end - beg; ++i) {
        const entry_t *const sib_entry = entry_for_index(sib, beg + i);
        const size_t sib_entry_size = btree_type::entry_size(bs, sib_entry);
        total_entry_size += sib_entry_size;
    }

    size_t insertion_offset = node.block_size;
    node = node_buf->resize<main_leaf_node_t>(insertion_offset + total_entry_size);

    std::vector<scoped_malloc_t<void> > moved_live_entries;
    for (size_t i = 0; i < end - beg; ++i) {
        entry_t *const sib_entry = entry_for_index(sib, beg + i);
        const size_t sib_entry_size = btree_type::entry_size(bs, sib_entry);
        memcpy(get_entry(node, insertion_offset), sib_entry, sib_entry_size);
        if (btree_type::is_live(sib_entry)) {
            // TODO(2014-11): These could be moved values and it would be faster.
            scoped_malloc_t<void> m(sib_entry_size);
            memcpy(m.get(), sib_entry, sib_entry_size);
            moved_live_entries.push_back(std::move(m));
        }
        node.buf->pair_offsets[insert_point + i] = insertion_offset;
        subtract_entry_size_change<btree_type>(sib.buf, sib_entry, sib_entry_size);
        add_entry_size_change<btree_type>(node.buf, sib_entry, sib_entry_size);
        memset(sib_entry, ENTRY_WIPE_CODE, sib_entry_size);
        insertion_offset += sib_entry_size;
    }

    memmove(sib.buf->pair_offsets + beg, sib.buf->pair_offsets + end, (end - beg) * sizeof(uint16_t));
    memset(sib.buf->pair_offsets + sib.buf->num_pairs - (end - beg),
           ENTRY_WIPE_CODE,
           (end - beg) * sizeof(uint16_t));
    sib.buf->num_pairs -= end - beg;
    recompute_frontmost(sib);
    *moved_live_entries_out = std::move(moved_live_entries);
}

// We move entries out of sibling and into node.
template <class btree_type>
void new_leaf_t<btree_type>::level(
        default_block_size_t bs,
        int nodecmp_node_with_sib,
        buf_write_t *node_buf,
        buf_write_t *sib_buf,
        store_key_t *replacement_key_out,
        std::vector<scoped_malloc_t<void> > *moved_live_entries_out) {
    rassert(node_buf != sib_buf);

    sized_ptr_t<main_leaf_node_t> node = node_buf->get_sized_data_write<main_leaf_node_t>();
    sized_ptr_t<main_leaf_node_t> sib = sib_buf->get_sized_data_write<main_leaf_node_t>();

    // If sib were underfull, we'd just merge the nodes.
    rassert(is_underfull(bs, node.buf));
    rassert(!is_underfull(bs, sib.buf));

    // We want to balance the nodes evenly.


    // The point in node at which we insert entries.
    size_t insert_point;
    // The [beg, end) interval of sib whose entries we move.
    size_t beg;
    size_t end;

    {
        const size_t base_cost = node_cost(node.buf);
        const size_t half_cost = (node_cost(node.buf) + node_cost(sib.buf)) / 2;

        // We stop when base_cost + used_size >= half_cost.  This means we'll always over-level,
        // so that node has a greater cost than sib (ignoring the fact that we might
        // remove some of node's dead entries).  This bias is fine -- it means we'll
        // have fewer levelings on sequential deletion workloads.
        if (nodecmp_node_with_sib < 0) {
            insert_point = node.buf->num_pairs;
            beg = 0;
            end = 0;
            size_t used_size = 0;
            const size_t e = sib.buf->num_pairs;
            while (base_cost + used_size < half_cost) {
                if (end == e) {
                    break;
                }
                const entry_t *entry = entry_for_index(sib, end);
                const size_t entry_cost
                    = sizeof(uint16_t) + btree_type::entry_size(bs, entry);
                used_size += entry_cost;
                ++end;
            }
        } else {
            insert_point = 0;
            beg = sib.buf->num_pairs;
            end = sib.buf->num_pairs;
            size_t used_size = 0;
            while (base_cost + used_size < half_cost) {
                if (beg == 0) {
                    break;
                }
                --beg;
                const entry_t *entry = entry_for_index(sib, beg);
                const size_t entry_cost
                    = sizeof(uint16_t) + btree_type::entry_size(bs, entry);
                used_size += entry_cost;
            }
        }
    }

    move_entries<btree_type>(bs, node_buf, insert_point, sib_buf, beg, end, moved_live_entries_out);
    node = node_buf->get_sized_data_write<main_leaf_node_t>();
    sib = sib_buf->get_sized_data_write<main_leaf_node_t>();

    const repli_timestamp_t superceding =
        superceding_recency(node.buf->partial_replicability_age,
                            sib.buf->partial_replicability_age);
    node.buf->partial_replicability_age = superceding;
    remove_too_old_dead_entries<btree_type>(bs, node);

    node = compactify<btree_type>(bs, node_buf);
    sib = compactify<btree_type>(bs, sib_buf);

    // TODO(2014-11): I'd like proof that doesn't rely on entry size vs. block size
    // math that node or sib is now non-empty.
    keycpy(replacement_key_out->btree_key(),
           btree_type::entry_key(nodecmp_node_with_sib < 0
                                 ? entry_for_index(node, node.buf->num_pairs - 1)
                                 : entry_for_index(sib, sib.buf->num_pairs - 1)));
}


// Moves elements from left, to right.
template <class btree_type>
void new_leaf_t<btree_type>::merge(default_block_size_t bs,
                                   buf_write_t *left, buf_write_t *right) {
    sized_ptr_t<main_leaf_node_t> left_node = left->get_sized_data_write<main_leaf_node_t>();
    std::vector<scoped_malloc_t<void> > moved_live_entries;

    move_entries<btree_type>(bs, right, 0, left, 0, left_node.buf->num_pairs, &moved_live_entries);

    left_node = left->get_sized_data_write<main_leaf_node_t>();
    sized_ptr_t<main_leaf_node_t> right_node = right->get_sized_data_write<main_leaf_node_t>();

    const repli_timestamp_t superceding =
        superceding_recency(left_node.buf->partial_replicability_age,
                            right_node.buf->partial_replicability_age);
    right_node.buf->partial_replicability_age = superceding;
    remove_too_old_dead_entries<btree_type>(bs, right_node);
    right_node = compactify<btree_type>(bs, right);

    // left_node should be emptied out and discarded, but it should also be a valid
    // empty (albeit oversized) leaf node.
    rassert(left_node.buf->num_pairs == 0);
    new_leaf_t<btree_type>::validate(bs, left_node);
}

template <class btree_type>
bool new_leaf_t<btree_type>::is_mergable(default_block_size_t bs,
                                         const main_leaf_node_t *node,
                                         const main_leaf_node_t *sibling) {
    return is_underfull(bs, node) && is_underfull(bs, sibling);
}


// Returning `all_live_entries` means that we can't give precise information about
// the (dead) entries added since time `minimum_tstamp`, because some dead entries
// were dropped.  Instead we return (to entries_out) just all the live entries in the
// entire leaf node.
template <class btree_type>
dump_result_t new_leaf_t<btree_type>::dump_entries_since_time(
        sized_ptr_t<const main_leaf_node_t> node,
        repli_timestamp_t minimum_tstamp,
        std::vector<const void *> *entries_out) {
    const bool exact = minimum_tstamp >= node.buf->partial_replicability_age;

    std::vector<const void *> entries;
    for (size_t i = 0, e = node.buf->num_pairs; i < e; ++i) {
        const entry_t *entry = entry_for_index(node, i);
        if (exact
            ? (btree_type::entry_timestamp(entry) >= minimum_tstamp)
            : (btree_type::is_live(entry))) {
            entries.push_back(entry);
        }
    }
    *entries_out = std::move(entries);
    return exact ? dump_result_t::exact_live_and_dead_entries : dump_result_t::all_live_entries;
}

template <class btree_type>
buf_ptr_t new_leaf_t<btree_type>::reconstruct(UNUSED default_block_size_t bs,
                                              UNUSED const leaf::state_description_t &desc) {
    crash("RSI: unimplemented");
}


template <class btree_type>
new_leaf_t<btree_type>::live_iter_t::live_iter_t(sized_ptr_t<const main_leaf_node_t> node, int index)
    : node_(node), index_(index) {
    advance_index();
}

template <class btree_type>
void new_leaf_t<btree_type>::live_iter_t::advance_index() {
    while (index_ < node_.buf->num_pairs && !btree_type::is_live(entry_for_index(node_, index_))) {
        ++index_;
    }
}

template <class btree_type>
void new_leaf_t<btree_type>::live_iter_t::step() {
    rassert(index_ < node_.buf->num_pairs);
    ++index_;
    advance_index();
}

template <class btree_type>
void new_leaf_t<btree_type>::live_iter_t::step_backward() {
    do {
        rassert(index_ > 0);
        --index_;
    } while (!btree_type::is_live(entry_for_index(node_, index_)));
}

template <class btree_type>
const void *new_leaf_t<btree_type>::live_iter_t::entry() const {
    rassert(index_ >= 0);
    return entry_for_index(node_, index_);
}

#ifndef NDEBUG
template <class btree_type>
void new_leaf_t<btree_type>::validate(default_block_size_t bs,
                                      sized_ptr_t<const main_leaf_node_t> node) {
    rassert(node.buf->magic == main_leaf_node_t::expected_magic);
    const size_t back_of_pair_offsets = pair_offsets_back_offset(node.buf->num_pairs);
    rassert(node.block_size >= back_of_pair_offsets);

    rassert(node.buf->frontmost >= back_of_pair_offsets);

    rassert(node.buf->frontmost +
            (node.buf->live_entry_size + node.buf->dead_entry_size - node.buf->num_pairs * sizeof(uint16_t))
            <= node.block_size,
            "frontmost = %d, live_entry_size = %d, dead_entry_size = %d, num_pairs = %d, block_size = %" PRIu32 ", failed comparison is %zu <= %" PRIu32,
            node.buf->frontmost, node.buf->live_entry_size, node.buf->dead_entry_size,
            node.buf->num_pairs,
            node.block_size,
            node.buf->frontmost + (node.buf->live_entry_size + node.buf->dead_entry_size - node.buf->num_pairs * sizeof(uint16_t)),
            node.block_size);

    std::vector<std::pair<size_t, size_t> > entry_bounds;
    entry_bounds.reserve(node.buf->num_pairs);

    // First, get minimal length info (before we try to do anything fancier with entries).
    for (uint16_t i = 0; i < node.buf->num_pairs; ++i) {
        size_t offset = node.buf->pair_offsets[i];
        const entry_t *entry = get_entry(node, offset);
        rassert(btree_type::entry_fits(bs, entry, node.block_size - offset));
        size_t entry_size = btree_type::entry_size(bs, entry);

        // This is redundant with the entry_fits assertion.
        rassert(entry_size <= node.block_size - offset);

        entry_bounds.push_back(std::make_pair(offset, offset + btree_type::entry_size(bs, entry)));
    }

    // Then check that no entries overlap.
    std::sort(entry_bounds.begin(), entry_bounds.end());
    if (entry_bounds.size() > 0) {
        rassert(entry_bounds[0].first >= node.buf->frontmost);
    }

    {
        size_t prev_back_offset = back_of_pair_offsets;
        for (auto pair : entry_bounds) {
            rassert(pair.first >= prev_back_offset);
            prev_back_offset = pair.second;
        }

        // This is redundant with some preceding entry_fits assertion.
        rassert(prev_back_offset <= node.block_size,
                "prev_back_offset = %zu, block_size = %" PRIu32,
                prev_back_offset, node.block_size);
    }

    // Now that entries don't overlap, do other per-entry validation.

    uint16_t frontmost_offset = node.block_size;
    size_t live_size = 0;
    size_t dead_size = 0;

    for (uint16_t i = 0; i < node.buf->num_pairs; ++i) {
        frontmost_offset = std::min(frontmost_offset, node.buf->pair_offsets[i]);
        const entry_t *entry = entry_for_index(node, i);

        if (i > 0) {
            rassert(btree_type::compare_entry_to_entry(entry_for_index(node, i - 1), entry) < 0);
        }

        if (btree_type::is_live(entry)) {
            live_size += btree_type::entry_size(bs, entry) + sizeof(uint16_t);
        } else {
            // A dead entry.  All entries are live or dead.
            dead_size += btree_type::entry_size(bs, entry) + sizeof(uint16_t);
            const repli_timestamp_t tstamp = btree_type::entry_timestamp(entry);
            rassert(tstamp != repli_timestamp_t::invalid);
            rassert(tstamp >= node.buf->partial_replicability_age);
        }
    }

    rassert(node.buf->frontmost == frontmost_offset);
    rassert(node.buf->live_entry_size == live_size);
    rassert(node.buf->dead_entry_size == dead_size);
}
#endif  // NDEBUG


}  // namespace new_leaf


#endif  // BTREE_NEW_LEAF_TCC_
