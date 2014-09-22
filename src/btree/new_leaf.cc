#include "btree/new_leaf.hpp"

#include <algorithm>
#include <vector>

#include "btree/keys.hpp"
#include "btree/leaf_structure.hpp"
#include "btree/node.hpp"
#include "buffer_cache/sized_ptr.hpp"
#include "serializer/buf_ptr.hpp"

// There is no instantiation for entry_t anywhere.
namespace new_leaf {

struct entry_t;

// Here's what an "[entry]" may look like:
//
//   [repli_timestamp][btree key][btree value]      -- a live entry
//   [repli_timestamp][255][btree key]              -- a deletion entry
//
// Differences from old_leaf:
//
//   - An "entry" structure includes the timestamp (because now all entries have timestamps).
//
//   - There are no "skip" entries (because we don't care to enumerate the entries
//     efficiently in physical order, because there's no meaning to their physical
//     order).  Unused space in the block SHOULD be zeroed to avoid having unused
//     space on disk.

struct orig_btree_t {
public:
    static int compare_key_to_entry(const btree_key_t *left, const entry_t *right) {
        return btree_key_cmp(left, entry_key(right));
    }

    // Used by validate.  Compares entries' keys.
    static int compare_entry_to_entry(const entry_t *left, const entry_t *right) {
        return btree_key_cmp(entry_key(left), entry_key(right));
    }

    static bool entry_fits(value_sizer_t *sizer, const entry_t *entry, size_t length_available) {
        const uint8_t *const p = reinterpret_cast<const uint8_t *>(entry);
        size_t stepped = sizeof(repli_timestamp_t);
        if (stepped + 1 > length_available) {
            return false;
        }
        if (*(p + stepped) == DELETION_ENTRY_CODE) {
            ++stepped;
            if (stepped + 1 > length_available) {
                return false;
            }
        }
        const btree_key_t *key = reinterpret_cast<const btree_key_t *>(p + stepped);
        static_assert(offsetof(btree_key_t, size) == 0 && sizeof(key->size) == 1,
                      "btree_key_t shape has changed.");

        rassert(key->size <= MAX_KEY_SIZE);
        stepped += key->full_size();
        if (stepped > length_available) {
            return false;
        }

        rassert(length_available <= INT_MAX);

        return sizer->fits(p + stepped, length_available - stepped);
    }

    static size_t entry_size(value_sizer_t *sizer, const entry_t *entry) {
        const uint8_t *const p = reinterpret_cast<const uint8_t *>(entry);
        size_t stepped = sizeof(repli_timestamp_t);
        if (*(p + stepped) == DELETION_ENTRY_CODE) {
            ++stepped;
        }
        const btree_key_t *key = reinterpret_cast<const btree_key_t *>(p + stepped);
        rassert(key->size <= MAX_KEY_SIZE);
        stepped += key->full_size();
        return stepped + sizer->size(p + stepped);
    }

    static bool is_live(const entry_t *entry) {
        const uint8_t *const p = reinterpret_cast<const uint8_t *>(entry);
        return *(p + sizeof(repli_timestamp_t)) != DELETION_ENTRY_CODE;
    }

private:
    static const uint8_t DELETION_ENTRY_CODE = 255;

    static const btree_key_t *entry_key(const entry_t *entry) {
        static_assert(DELETION_ENTRY_CODE > MAX_KEY_SIZE, "DELETION_ENTRY_CODE incompatible with MAX_KEY_SIZE.");

        const uint8_t *p = reinterpret_cast<const uint8_t *>(entry) + sizeof(repli_timestamp_t);
        if (*p == DELETION_ENTRY_CODE) {
            ++p;
        }
        const btree_key_t *ret = reinterpret_cast<const btree_key_t *>(p);
        rassert(ret->size <= MAX_KEY_SIZE);
        return ret;
    }
};



const entry_t *get_entry(sized_ptr_t<const main_leaf_node_t> node, size_t offset) {
    rassert(offset >= offsetof(main_leaf_node_t, pair_offsets) + node.buf->num_pairs * sizeof(uint16_t));
    rassert(offset < node.block_size);
    return reinterpret_cast<const entry_t *>(reinterpret_cast<const char *>(node.buf) + offset);
}

const entry_t *entry_for_index(sized_ptr_t<const main_leaf_node_t> node, int index) {
    rassert(index >= 0 && index < node.buf->num_pairs);
    return get_entry(node, node.buf->pair_offsets[index]);
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

#ifndef NDEBUG
template <class btree_type>
void new_leaf_t<btree_type>::validate(value_sizer_t *sizer, sized_ptr_t<const main_leaf_node_t> node) {
    rassert(node.buf->magic == main_leaf_node_t::expected_magic);
    const size_t back_of_pair_offsets = node.buf->num_pairs * sizeof(uint16_t) + offsetof(main_leaf_node_t, pair_offsets);
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
    {
        size_t prev_back_offset = offsetof(main_leaf_node_t, pair_offsets) + back_of_pair_offsets;
        for (auto pair : entry_bounds) {
            rassert(pair.first >= prev_back_offset);
            prev_back_offset = pair.second;
        }

        // This is redundant with some preceding entry_fits assertion.
        rassert(prev_back_offset <= node.block_size);
    }

    // Now that entries don't overlap, do other per-entry validation.

    size_t live_size = 0;
    size_t dead_size = 0;

    for (uint16_t i = 0; i < node.buf->num_pairs; ++i) {
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

    rassert(node.buf->live_entry_size == live_size);
    rassert(node.buf->dead_entry_size == dead_size);

}
#endif  // NDEBUG

template struct new_leaf_t<orig_btree_t>;

}  // namespace new_leaf
