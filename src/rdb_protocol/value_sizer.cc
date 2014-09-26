#include "rdb_protocol/value_sizer.hpp"

#include "rdb_protocol/lazy_json.hpp"

rdb_value_sizer_t::rdb_value_sizer_t(default_block_size_t bs) : block_size_(bs) { }

const rdb_value_t *rdb_value_sizer_t::as_rdb(const void *p) {
    return reinterpret_cast<const rdb_value_t *>(p);
}

int rdb_value_sizer_t::size(const void *value) const {
    return as_rdb(value)->inline_size(block_size_);
}

bool rdb_value_sizer_t::fits(const void *value, int length_available) const {
    return btree_value_fits(block_size_, length_available, as_rdb(value));
}

int rdb_value_sizer_t::max_possible_size() const {
    return blob::btree_maxreflen;
}

default_block_size_t rdb_value_sizer_t::default_block_size() const { return block_size_; }

bool btree_value_fits(default_block_size_t bs, int data_length, const rdb_value_t *value) {
    return blob::ref_fits(bs, data_length, value->value_ref(), blob::btree_maxreflen);
}
