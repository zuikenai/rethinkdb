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

// The byte value we use to wipe entries with.
#define ENTRY_WIPE_CODE 0

// There is no instantiation for entry_t anywhere.
namespace new_leaf {

struct entry_t;


size_t pair_offsets_back_offset(int num_pairs) {
    return offsetof(main_leaf_node_t, pair_offsets) + num_pairs * sizeof(uint16_t);
}

size_t pair_offsets_back_offset(const main_leaf_node_t *node) {
    return pair_offsets_back_offset(node->num_pairs);
}

const entry_t *get_entry(sized_ptr_t<const main_leaf_node_t> node, size_t offset) {
    rassert(offset >= pair_offsets_back_offset(node.buf));
    rassert(offset < node.block_size);
    return reinterpret_cast<const entry_t *>(reinterpret_cast<const char *>(node.buf) + offset);
}

entry_t *get_entry(sized_ptr_t<main_leaf_node_t> node, size_t offset) {
    return const_cast<entry_t *>(get_entry(sized_ptr_t<const main_leaf_node_t>(node), offset));
}

const entry_t *entry_for_index(sized_ptr_t<const main_leaf_node_t> node, int index) {
    rassert(index >= 0 && index < node.buf->num_pairs);
    return get_entry(node, node.buf->pair_offsets[index]);
}

entry_t *entry_for_index(sized_ptr_t<main_leaf_node_t> node, int index) {
    rassert(index >= 0 && index < node.buf->num_pairs);
    return get_entry(node, node.buf->pair_offsets[index]);
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
        node->live_entry_size -= entry_size - sizeof(uint16_t);
    } else {
        node->dead_entry_size -= entry_size - sizeof(uint16_t);
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

template <class btree_type>
void normalize(value_sizer_t *sizer, buf_write_t *buf) {
    // RSI: Implement.
    new_leaf_t<btree_type>::validate(sizer,
                                     buf->get_sized_data_write<main_leaf_node_t>());
}

void recompute_frontmost(sized_ptr_t<main_leaf_node_t> node) {
    uint16_t frontmost = node.block_size;
    for (uint16_t i = 0, e = node.buf->num_pairs; i < e; ++i) {
        frontmost = std::min(frontmost, node.buf->pair_offsets[i]);
    }
    node.buf->frontmost = frontmost;
}

// This doesn't call normalize, which you might want to do.
template <class btree_type>
void remove_entry_for_index(value_sizer_t *sizer,
                            sized_ptr_t<main_leaf_node_t> node,
                            int index) {
    rassert(0 <= index && index < node.buf->num_pairs);
    const size_t entry_offset = node.buf->pair_offsets[index];
    const entry_t *entry = get_entry(node, entry_offset);
    const size_t entry_size = btree_type::entry_size(sizer, entry);

    subtract_entry_size_change<btree_type>(node.buf, entry, entry_size);
    memmove(node.buf->pair_offsets + index, node.buf->pair_offsets + index + 1,
            (node.buf->num_pairs - (index + 1)) * sizeof(uint16_t));
    node.buf->num_pairs -= 1;
    if (entry_offset == node.buf->frontmost) {
        recompute_frontmost(node);
    }
}

// Invalidates old buf pointers that were returned by get_data_write -- either call get_data_write again, or use this return value.
template <class btree_type>
MUST_USE sized_ptr_t<main_leaf_node_t>
make_gap_in_pair_offsets(value_sizer_t *sizer, buf_write_t *buf, int index, int size) {
    sized_ptr_t<main_leaf_node_t> node = buf->get_sized_data_write<main_leaf_node_t>();
    rassert(0 <= index && index <= node.buf->num_pairs);
    const size_t new_num_pairs = node.buf->num_pairs + size;
    const size_t new_back = pair_offsets_back_offset(new_num_pairs);

    if (node.buf->num_pairs == 0) {
        node = buf->resize<main_leaf_node_t>(new_back);
        recompute_frontmost(node);
    } else {
        // RSI: Make validate check that frontmost is a tight bound.
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
            const size_t entry_size = btree_type::entry_size(sizer, entry);
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
void new_leaf_t<btree_type>::insert(value_sizer_t *sizer,
                                    buf_write_t *buf,
                                    const void *v_entry) {
    const entry_t *entry = static_cast<const entry_t *>(v_entry);
    const size_t entry_size = btree_type::entry_size(sizer, entry);
    const btree_key_t *const key = btree_type::entry_key(entry);

    sized_ptr_t<main_leaf_node_t> node = buf->get_sized_data_write<main_leaf_node_t>();

    int index;
    const bool found = find_key(node, key, &index);

    if (found) {
        remove_entry_for_index<btree_type>(sizer, node, index);
    }

    node = make_gap_in_pair_offsets<btree_type>(sizer, buf, index, 1);

    const size_t insertion_offset = node.block_size;
    node = buf->resize<main_leaf_node_t>(node.block_size + entry_size);
    memcpy(get_entry(node, insertion_offset), entry, entry_size);
    node.buf->pair_offsets[index] = insertion_offset;
    add_entry_size_change<btree_type>(node.buf, entry, entry_size);

    normalize<btree_type>(sizer, buf);
}

// Removes an entry.  Asserts that the key is in the node.  TODO(2014-11): This means
// we're already sure the key is in the node, which means we're doing an unnecessary
// binary search.
template <class btree_type>
void new_leaf_t<btree_type>::erase_presence(value_sizer_t *sizer,
                                            buf_write_t *buf,
                                            const btree_key_t *key) {
    sized_ptr_t<main_leaf_node_t> node = buf->get_sized_data_write<main_leaf_node_t>();

    int index;
    const bool found = find_key(node, key, &index);
    guarantee(found);

    remove_entry_for_index<btree_type>(sizer, node, index);
    normalize<btree_type>(sizer, buf);
}






#ifndef NDEBUG
template <class btree_type>
void new_leaf_t<btree_type>::validate(value_sizer_t *sizer, sized_ptr_t<const main_leaf_node_t> node) {
    rassert(node.buf->magic == main_leaf_node_t::expected_magic);
    const size_t back_of_pair_offsets = pair_offsets_back_offset(node.buf);
    rassert(node.block_size >= back_of_pair_offsets);

    rassert(node.buf->frontmost >= back_of_pair_offsets);

    rassert(node.buf->frontmost +
            (node.buf->live_entry_size + node.buf->dead_entry_size - node.buf->num_pairs * sizeof(uint16_t))
            <= node.block_size);

    std::vector<std::pair<size_t, size_t> > entry_bounds;

    // First, get minimal length info (before we try to do anything fancier with entries).
    for (uint16_t i = 0; i < node.buf->num_pairs; ++i) {
        size_t offset = node.buf->pair_offsets[i];
        const entry_t *entry = get_entry(node, offset);
        rassert(btree_type::entry_fits(sizer, entry, node.block_size - offset));
        size_t entry_size = btree_type::entry_size(sizer, entry);

        // This is redundant with the entry_fits assertion.
        rassert(entry_size <= node.block_size - offset);

        entry_bounds.push_back(std::make_pair(offset, offset + btree_type::entry_size(sizer, entry)));
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
            live_size += btree_type::entry_size(sizer, entry) + sizeof(uint16_t);
        } else {
            // A dead entry.  All entries are live or dead.
            dead_size += btree_type::entry_size(sizer, entry) + sizeof(uint16_t);
        }
    }

    rassert(node.buf->frontmost == frontmost_offset);
    rassert(node.buf->live_entry_size == live_size);
    rassert(node.buf->dead_entry_size == dead_size);
}
#endif  // NDEBUG



template class new_leaf_t<main_btree_t>;

}  // namespace new_leaf
