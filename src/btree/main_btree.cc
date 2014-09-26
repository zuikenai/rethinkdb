#include "btree/main_btree.hpp"

bool main_btree_t::entry_fits(value_sizer_t *sizer, const entry_t *entry, size_t length_available) {
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

    return value_fits(sizer, p + stepped, length_available - stepped);
}


size_t main_btree_t::entry_size(value_sizer_t *sizer, const entry_t *entry) {
    const uint8_t *const p = reinterpret_cast<const uint8_t *>(entry);
    size_t stepped = sizeof(repli_timestamp_t);
    if (*(p + stepped) == DELETION_ENTRY_CODE) {
        ++stepped;
    }
    const btree_key_t *key = reinterpret_cast<const btree_key_t *>(p + stepped);
    rassert(key->size <= MAX_KEY_SIZE);
    stepped += key->full_size();
    return stepped + value_size(sizer, p + stepped);
}
