#include "btree/main_btree.hpp"

#include "btree/leaf_node.hpp"
#include "containers/scoped.hpp"
#include "rdb_protocol/value_sizer.hpp"
#include "serializer/types.hpp"

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

const leaf::entry_ptrs_t main_btree_t::entry_ptrs(const entry_t *entry) {
    static_assert(DELETION_ENTRY_CODE > MAX_KEY_SIZE, "DELETION_ENTRY_CODE incompatible with MAX_KEY_SIZE.");
    const uint8_t *const p = reinterpret_cast<const uint8_t *>(entry);
    leaf::entry_ptrs_t ret;
    ret.tstamp = *reinterpret_cast<const repli_timestamp_t *>(p);
    size_t stepped = sizeof(repli_timestamp_t);
    bool is_dead;
    if (*(p + stepped) == DELETION_ENTRY_CODE) {
        ++stepped;
        is_dead = true;
    } else {
        is_dead = false;
    }
    const btree_key_t *key = reinterpret_cast<const btree_key_t *>(p + stepped);
    ret.key = key;
    rassert(key->size <= MAX_KEY_SIZE);
    stepped += key->full_size();
    ret.value_or_null = is_dead ? nullptr : p + stepped;
    return ret;
}

const void *main_btree_t::live_entry_value(const entry_t *entry) {
    const uint8_t *p = reinterpret_cast<const uint8_t *>(entry);
    size_t stepped = sizeof(repli_timestamp_t);
    rassert(*(p + stepped) != DELETION_ENTRY_CODE);
    const btree_key_t *key = reinterpret_cast<const btree_key_t *>(p + stepped);
    stepped += key->full_size();
    return p + stepped;
}

size_t main_btree_t::live_entry_size_from_keyvalue(default_block_size_t bs,
                                                   const btree_key_t *key,
                                                   const void *value) {
    return sizeof(repli_timestamp_t) + key->full_size() + value_size(bs, value);
}

size_t main_btree_t::dead_entry_size_from_key(const btree_key_t *key) {
    return sizeof(repli_timestamp_t) + 1 + key->full_size();
}

scoped_malloc_t<main_btree_t::entry_t>
main_btree_t::combine_live_entry(default_block_size_t bs,
                                 repli_timestamp_t tstamp,
                                 const btree_key_t *key,
                                 const void *value) {
    const size_t k = key->full_size();
    const size_t v = value_size(bs, value);
    scoped_malloc_t<entry_t> m(sizeof(repli_timestamp_t) + k + v);
    *reinterpret_cast<repli_timestamp_t *>(m.get()) = tstamp;
    char *p = reinterpret_cast<char *>(m.get());
    memcpy(p + sizeof(repli_timestamp_t), key, k);
    memcpy(p + sizeof(repli_timestamp_t) + k, value, v);
    return m;
}

scoped_malloc_t<main_btree_t::entry_t>
main_btree_t::combine_dead_entry(repli_timestamp_t tstamp, const btree_key_t *key) {
    const size_t k = key->full_size();
    scoped_malloc_t<entry_t> m(sizeof(repli_timestamp_t) + 1 + k);
    *reinterpret_cast<repli_timestamp_t *>(m.get()) = tstamp;
    uint8_t *p = reinterpret_cast<uint8_t *>(m.get());
    *(p + sizeof(repli_timestamp_t)) = DELETION_ENTRY_CODE;
    memcpy(p + sizeof(repli_timestamp_t) + 1, key, k);
    return m;
}
