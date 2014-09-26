#ifndef BTREE_MAIN_BTREE_HPP_
#define BTREE_MAIN_BTREE_HPP_

#include "btree/node.hpp"
#include "repli_timestamp.hpp"

// main_btree_t implements the leaf node type parameter trait.

// Here's what an "[entry]" may look like:
//
//   [repli_timestamp][btree key][btree value]      -- a live entry
//   [repli_timestamp][255][btree key]              -- a deletion entry
//
// Differences from old_leaf:
//
//   - An "entry" structure includes the timestamp (because now all entries have
//     timestamps).
//
//   - There are no "skip" entries (because we don't care to enumerate the entries
//     efficiently in physical order, because there's no meaning to their physical
//     order).  Unused space in the block SHOULD be zeroed to avoid having garbage
//     data on disk.

namespace new_leaf {
struct entry_t;
}

struct main_btree_t {
public:
    typedef new_leaf::entry_t entry_t;

    static int compare_key_to_entry(const btree_key_t *left, const entry_t *right) {
        return btree_key_cmp(left, entry_key(right));
    }

    // Used by validate.  Compares entries' keys.
    static int compare_entry_to_entry(const entry_t *left, const entry_t *right) {
        return btree_key_cmp(entry_key(left), entry_key(right));
    }

    static bool entry_fits(value_sizer_t *sizer, const entry_t *entry, size_t length_available);

    static size_t entry_size(value_sizer_t *sizer, const entry_t *entry);

    static bool is_live(const entry_t *entry) {
        const uint8_t *const p = reinterpret_cast<const uint8_t *>(entry);
        return *(p + sizeof(repli_timestamp_t)) != DELETION_ENTRY_CODE;
    }

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

private:
    static size_t value_size(value_sizer_t *sizer, const void *value) {
        return sizer->size(value);
    }

    static size_t value_fits(value_sizer_t *sizer, const void *value,
                             size_t length_available) {
        return sizer->fits(value, length_available);
    }

    static const uint8_t DELETION_ENTRY_CODE = 255;
};



#endif  // BTREE_MAIN_BTREE_HPP_
