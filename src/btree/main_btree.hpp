#ifndef BTREE_MAIN_BTREE_HPP_
#define BTREE_MAIN_BTREE_HPP_

#include "btree/node.hpp"
#include "config/args.hpp"
#include "repli_timestamp.hpp"

// main_btree_t implements the leaf node type parameter trait.

// Here's what an "[entry]" may look like:
//
//   [repli_timestamp][btree key][btree value]      -- a live entry
//   [repli_timestamp][255][btree key]              -- a deletion entry
//
// Note that [btree value] consists of a blob reference of maxreflen
// BLOB_BTREE_MAXREFLEN.
//
// Differences from old_leaf:
//
//   - An "entry" structure includes the timestamp (because now all entries have
//     timestamps).
//
//   - There are no "skip" entries (because we don't care to enumerate the entries
//     efficiently in physical order, because there's no meaning to their physical
//     order).  Unused space in the block is zeroed to avoid having garbage
//     data on disk.

namespace new_leaf {
struct entry_t;
}

namespace leaf {
struct entry_ptrs_t;
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

    static bool entry_fits(default_block_size_t bs, const entry_t *entry, size_t length_available);

    static size_t entry_size(default_block_size_t bs, const entry_t *entry);

    static size_t live_entry_size_from_keyvalue(default_block_size_t bs,
                                                const btree_key_t *key,
                                                const void *value);

    static size_t dead_entry_size_from_key(const btree_key_t *key);

    // RSI: Rename or something -- they construct these things from old btrees.
    static scoped_malloc_t<entry_t> combine_live_entry(default_block_size_t bs,
                                                       repli_timestamp_t tstamp,
                                                       const btree_key_t *key,
                                                       const void *value);

    static scoped_malloc_t<entry_t> combine_dead_entry(repli_timestamp_t tstamp,
                                                       const btree_key_t *key);

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

    static const leaf::entry_ptrs_t entry_ptrs(const entry_t *entry);

    static const void *live_entry_value(const entry_t *entry);

    static repli_timestamp_t entry_timestamp(const entry_t *entry) {
        return *reinterpret_cast<const repli_timestamp_t *>(entry);
    }

    static size_t max_entry_size() {
        return sizeof(repli_timestamp_t) + 1 + MAX_KEY_SIZE + BLOB_BTREE_MAXREFLEN;
    }

    static size_t value_size(default_block_size_t bs, const void *value);

private:
    static size_t value_fits(default_block_size_t bs, const void *value,
                             size_t length_available);

    static const uint8_t DELETION_ENTRY_CODE = 255;
};



#endif  // BTREE_MAIN_BTREE_HPP_
