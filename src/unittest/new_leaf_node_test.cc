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
    using cache_t::default_block_size;
    test_cache_t()
        : mock_file_opener_t(),
          standard_serializer_t(standard_serializer_t::dynamic_config_t(),
                                this,
                                &get_global_perfmon_collection()),
          dummy_cache_balancer_t(GIGABYTE),
          cache_t(this, this, &get_global_perfmon_collection())
    { }
};

class test_txn_t : private test_cache_t,
                   private cache_conn_t,
                   public txn_t {
public:
    using test_cache_t::default_block_size;
    test_txn_t()
        : test_cache_t(),
          cache_conn_t(this),
          txn_t(this, write_durability_t::SOFT, repli_timestamp_t::distant_past) { }
};

TEST(NewLeafNodeTest, InitValidate) {
    buf_ptr_t buf = main_leaf_t::init();

    // Let's hope validate doesn't crash!  That's what this test does...
    short_value_sizer_t sizer(default_block_size_t::unsafe_make(4096));
    main_leaf_t::validate(&sizer, buf.sized_cache_data<main_leaf_node_t>());
}

TEST(NewLeafNodeTest, InsertFind) {
    test_txn_t txn;
    short_value_sizer_t sizer(txn.default_block_size());
    buf_lock_t lock(buf_parent_t(&txn), alt_create_t::create);

    buf_write_t write(&lock);


}

}  // namespace new_leaf_node_test

}  // namespace unittest
