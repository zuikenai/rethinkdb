// Copyright 2010-2014 RethinkDB, all rights reserved.
#include <map>

#include "btree/leaf_structure.hpp"
#include "btree/main_btree.hpp"
#include "btree/new_leaf.hpp"
#include "btree/node.hpp"
#include "serializer/buf_ptr.hpp"
#include "unittest/gtest.hpp"
#include "unittest/leaf_node_test.hpp"

namespace unittest {

namespace new_leaf_node_test {

using main_leaf_t = new_leaf_t<main_btree_t>;

TEST(NewLeafNodeTest, InitValidate) {
    buf_ptr_t buf = main_leaf_t::init();

    // Let's hope validate doesn't crash!  That's what this test does...
    short_value_sizer_t sizer(default_block_size_t::unsafe_make(4096));
    main_leaf_t::validate(&sizer, buf.sized_cache_data<main_leaf_node_t>());
}

}  // namespace new_leaf_node_test

}  // namespace unittest
