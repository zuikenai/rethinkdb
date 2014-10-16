#include "btree/main_btree.hpp"

#include "serializer/types.hpp"
#include "rdb_protocol/value_sizer.hpp"

size_t main_btree_t::value_size(default_block_size_t bs, const void *value) {
    rdb_value_sizer_t sizer(bs);
    return sizer.size(value);
}

size_t main_btree_t::value_fits(default_block_size_t bs, const void *value,
                                size_t length_available) {
    rdb_value_sizer_t sizer(bs);
    return sizer.fits(value, length_available);
}

bool main_btree_t::entry_fits(default_block_size_t bs, const entry_t *entry, size_t length_available) {
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

    return value_fits(bs, p + stepped, length_available - stepped);
}


size_t main_btree_t::entry_size(default_block_size_t bs, const entry_t *entry) {
    const uint8_t *const p = reinterpret_cast<const uint8_t *>(entry);
    size_t stepped = sizeof(repli_timestamp_t);
    if (*(p + stepped) == DELETION_ENTRY_CODE) {
        ++stepped;
    }
    const btree_key_t *key = reinterpret_cast<const btree_key_t *>(p + stepped);
    rassert(key->size <= MAX_KEY_SIZE);
    stepped += key->full_size();
    return stepped + value_size(bs, p + stepped);
}

size_t main_btree_t::live_entry_size_from_keyvalue(default_block_size_t bs,
                                                   const btree_key_t *key,
                                                   const void *value) {
    return sizeof(repli_timestamp_t) + key->full_size() + value_size(bs, value);
}

size_t main_btree_t::dead_entry_size_from_key(const btree_key_t *key) {
    return sizeof(repli_timestamp_t) + 1 + key->full_size();
}
