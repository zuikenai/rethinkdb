// Copyright 2010-2014 RethinkDB, all rights reserved.
#include <map>

#include "btree/leaf_structure.hpp"
#include "btree/new_leaf.hpp"
#include "btree/node.hpp"
#include "serializer/buf_ptr.hpp"
#include "unittest/gtest.hpp"

namespace unittest {

namespace new_leaf_node_test {

// RSI: This is a duplicate of old_leaf_node_test::short_value_sizer_t.
class short_value_sizer_t : public value_sizer_t {
public:
    explicit short_value_sizer_t(default_block_size_t bs) : block_size_(bs) { }

    int size(const void *value) const {
        int x = *reinterpret_cast<const uint8_t *>(value);
        return 1 + x;
    }

    bool fits(const void *value, int length_available) const {
        return length_available > 0 && size(value) <= length_available;
    }

    int max_possible_size() const {
        return 256;
    }

    default_block_size_t default_block_size() const { return block_size_; }

private:
    default_block_size_t block_size_;

    DISABLE_COPYING(short_value_sizer_t);
};

using orig_leaf_t = new_leaf_t<orig_btree_t>;

#ifndef NDEBUG
TEST(NewLeafNodeTest, InitValidate) {
    buf_ptr_t buf = orig_leaf_t::init();

    // Let's hope validate doesn't crash!  That's what this test does...
    short_value_sizer_t sizer(default_block_size_t::unsafe_make(4096));
    orig_leaf_t::validate(&sizer, buf.sized_cache_data<main_leaf_node_t>());
}
#endif

}  // namespace new_leaf_node_test

}  // namespace unittest
