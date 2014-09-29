// Copyright 2010-2014 RethinkDB, all rights reserved.
#include <map>

#include "btree/leaf_structure.hpp"
#include "btree/main_btree.hpp"
#include "btree/new_leaf.hpp"
#include "btree/node.hpp"
#include "buffer_cache/alt.hpp"
#include "buffer_cache/cache_balancer.hpp"
#include "serializer/buf_ptr.hpp"
#include "serializer/config.hpp"
#include "unittest/gtest.hpp"
#include "unittest/leaf_node_test.hpp"
#include "unittest/mock_file.hpp"

namespace unittest {

namespace new_leaf_node_test {

using main_leaf_t = new_leaf_t<main_btree_t>;

class test_cache_t
    : private mock_file_opener_t,
      private standard_serializer_t,
      private dummy_cache_balancer_t,
      public cache_t {
public:
    test_cache_t()
        : mock_file_opener_t(),
          standard_serializer_t(standard_serializer_t::dynamic_config_t(),
                                this,
                                &get_global_perfmon_collection()),
          dummy_cache_balancer_t(GIGABYTE),
          cache_t(this, this, &get_global_perfmon_collection())
    { }
};


TEST(NewLeafNodeTest, InitValidate) {
    buf_ptr_t buf = main_leaf_t::init();

    // Let's hope validate doesn't crash!  That's what this test does...
    short_value_sizer_t sizer(default_block_size_t::unsafe_make(4096));
    main_leaf_t::validate(&sizer, buf.sized_cache_data<main_leaf_node_t>());
}

}  // namespace new_leaf_node_test

}  // namespace unittest
