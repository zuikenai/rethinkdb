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
#include "unittest/unittest_utils.hpp"

namespace unittest {

namespace new_leaf_node_test {

using main_leaf_t = new_leaf_t<main_btree_t>;

scoped_ptr_t<standard_serializer_t> create_and_construct_serializer(serializer_file_opener_t *opener) {
    standard_serializer_t::create(opener, standard_serializer_t::static_config_t());
    return make_scoped<standard_serializer_t>(standard_serializer_t::dynamic_config_t(),
                                              opener,
                                              &get_global_perfmon_collection());
}

class test_cache_t {
public:
    test_cache_t()
        : opener_(),
          serializer_(create_and_construct_serializer(&opener_)),
          balancer_(GIGABYTE),
          cache_(serializer_.get(), &balancer_, &get_global_perfmon_collection())
    { }

protected:
    cache_t *get_cache() { return &cache_; }

private:
    mock_file_opener_t opener_;
    scoped_ptr_t<standard_serializer_t> serializer_;
    dummy_cache_balancer_t balancer_;
    cache_t cache_;
};

class test_txn_t : private test_cache_t,
                   private cache_conn_t,
                   public txn_t {
public:
    using txn_t::cache;

    test_txn_t()
        : test_cache_t(),
          cache_conn_t(test_cache_t::get_cache()),
          txn_t(this, write_durability_t::SOFT, repli_timestamp_t::distant_past) { }
};

scoped_malloc_t<void> make_live_entry(repli_timestamp_t timestamp,
                                      std::string key,
                                      std::string value) {
    guarantee(key.size() <= MAX_KEY_SIZE);
    guarantee(value.size() <= MAX_KEY_SIZE);
    const size_t computed_entry_size = sizeof(repli_timestamp_t) + 1 + key.size() + 1 + value.size();
    scoped_malloc_t<char> ret(computed_entry_size);

    store_key_t store_key(key);
    store_key_t store_value(value);

    *reinterpret_cast<repli_timestamp_t *>(ret.get()) = timestamp;
    keycpy(reinterpret_cast<btree_key_t *>(ret.get() + sizeof(repli_timestamp_t)),
           store_key.btree_key());
    keycpy(reinterpret_cast<btree_key_t *>(ret.get() + sizeof(repli_timestamp_t) + store_key.btree_key()->full_size()),
           store_value.btree_key());
    {
        short_value_sizer_t sizer(default_block_size_t::unsafe_make(4096));
        guarantee(computed_entry_size ==
                  main_btree_t::entry_size(&sizer,
                                           reinterpret_cast<main_btree_t::entry_t *>(ret.get())),
                  "computed_entry_size is %zu, real size is %zu",
                  computed_entry_size,
                  main_btree_t::entry_size(&sizer,
                                           reinterpret_cast<main_btree_t::entry_t *>(ret.get())));
    }
    return scoped_malloc_reinterpret_cast<void>(std::move(ret));
}

TEST(NewLeafNodeTest, InitValidate) {
    buf_ptr_t buf = main_leaf_t::init();

    // Let's hope validate doesn't crash!  That's what this test does...
    short_value_sizer_t sizer(default_block_size_t::unsafe_make(4096));
    main_leaf_t::validate(&sizer, buf.sized_cache_data<main_leaf_node_t>());
}

TPTEST(NewLeafNodeTest, InsertFind) {
    test_txn_t txn;
    short_value_sizer_t sizer(txn.cache()->default_block_size());
    buf_lock_t lock(buf_parent_t(&txn), alt_create_t::create);
    buf_write_t write(&lock);
    write.set_data_write(main_leaf_t::init());

    // Check that find_key works with an empty leaf node.
    int index;
    bool found = main_leaf_t::find_key(write.get_sized_data_write<main_leaf_node_t>(),
                                       store_key_t("a").btree_key(),
                                       &index);
    ASSERT_FALSE(found);

    {
        scoped_malloc_t<void> entry = make_live_entry(repli_timestamp_t::distant_past,
                                                      "b",
                                                      "abc");

        main_leaf_t::insert(&sizer, &write, entry.get());
    }

    // Now check that find_key works with the key we're looking for.
    found = main_leaf_t::find_key(write.get_sized_data_write<main_leaf_node_t>(),
                                       store_key_t("b").btree_key(),
                                       &index);
    ASSERT_TRUE(found);
    ASSERT_EQ(0, index);

    // And also check that it works with keys that we can't find.
    found = main_leaf_t::find_key(write.get_sized_data_write<main_leaf_node_t>(),
                                  store_key_t("a").btree_key(),
                                  &index);
    ASSERT_FALSE(found);

    found = main_leaf_t::find_key(write.get_sized_data_write<main_leaf_node_t>(),
                                  store_key_t("c").btree_key(),
                                  &index);
    ASSERT_FALSE(found);
}

}  // namespace new_leaf_node_test

}  // namespace unittest
