// Copyright 2010-2014 RethinkDB, all rights reserved.
#include <map>

#include "btree/leaf_structure.hpp"
#include "btree/main_btree.hpp"
#include "btree/new_leaf.hpp"
#include "btree/new_leaf.tcc"
#include "btree/node.hpp"
#include "buffer_cache/alt.hpp"
#include "buffer_cache/cache_balancer.hpp"
#include "serializer/buf_ptr.hpp"
#include "serializer/config.hpp"
#include "unittest/gtest.hpp"
#include "unittest/mock_file.hpp"
#include "unittest/unittest_utils.hpp"

namespace new_leaf {
struct entry_t;
}

namespace unittest {

namespace new_leaf_node_test {


struct test_btree_t {
public:
    static const uint8_t DEAD_ENTRY_CODE = 255;

    typedef new_leaf::entry_t entry_t;
    static int compare_key_to_entry(const btree_key_t *left, const entry_t *right) {
        return btree_key_cmp(left, entry_key(right));
    }

    // Used by validate.  Compares entries' keys.
    static int compare_entry_to_entry(const entry_t *left, const entry_t *right) {
        return btree_key_cmp(entry_key(left), entry_key(right));
    }

    static bool entry_fits(UNUSED default_block_size_t bs, const entry_t *entry, size_t length_available) {
        const uint8_t *p = reinterpret_cast<const uint8_t *>(entry);
        if (length_available < 1) {
            return false;
        }
        if (*p == DEAD_ENTRY_CODE) {
            const btree_key_t *key = reinterpret_cast<const btree_key_t *>(p + 1);
            return length_available >= 1u + key->full_size();
        } else {
            const btree_key_t *key = reinterpret_cast<const btree_key_t *>(p);
            size_t stepped = key->full_size();
            if (length_available < stepped + 1) {
                return false;
            }
            const btree_key_t *value = reinterpret_cast<const btree_key_t *>(p + stepped);
            stepped += value->full_size();
            return length_available >= stepped;
    }
    }

    static size_t entry_size(UNUSED default_block_size_t bs, const entry_t *entry) {
        const uint8_t *p = reinterpret_cast<const uint8_t *>(entry);
        if (*p == DEAD_ENTRY_CODE) {
            const btree_key_t *key = reinterpret_cast<const btree_key_t *>(p + 1);
            return 1 + key->full_size();
        } else {
            const btree_key_t *key = reinterpret_cast<const btree_key_t *>(p);
            size_t stepped = key->full_size();
            const btree_key_t *value = reinterpret_cast<const btree_key_t *>(p + stepped);
            return stepped + value->full_size();
        }
    }

    static bool is_live(const entry_t *entry) {
        const uint8_t *const p = reinterpret_cast<const uint8_t *>(entry);
        return *p != DEAD_ENTRY_CODE;
    }

    static size_t live_entry_size_from_keyvalue(UNUSED default_block_size_t bs,
                                                const btree_key_t *key,
                                                const void *value) {
        return key->full_size() + static_cast<const btree_key_t *>(value)->full_size();
    }

    static size_t dead_entry_size_from_key(const btree_key_t *key) {
        return 1 + key->full_size();
    }


    static scoped_malloc_t<entry_t> combine_live_entry(UNUSED default_block_size_t bs,
                                                       UNUSED repli_timestamp_t tstamp,
                                                       UNUSED const btree_key_t *key,
                                                       UNUSED const void *value) {
        // Nothing calls this because these unit tests don't deal with old-version
        // leaf nodes.
        unreachable();
    }

    static scoped_malloc_t<entry_t> combine_dead_entry(UNUSED repli_timestamp_t tstamp,
                                                       UNUSED const btree_key_t *key) {
        // Nothing calls this because these unit tests don't deal with old-version
        // leaf nodes.
        unreachable();
    }

    static const btree_key_t *entry_key(const entry_t *entry) {
        static_assert(DEAD_ENTRY_CODE > MAX_KEY_SIZE, "DEAD_ENTRY_CODE incompatible with MAX_KEY_SIZE.");

        const uint8_t *p = reinterpret_cast<const uint8_t *>(entry);

        if (*p == DEAD_ENTRY_CODE) {
            ++p;
        }
        const btree_key_t *ret = reinterpret_cast<const btree_key_t *>(p);
        guarantee(ret->size <= MAX_KEY_SIZE);
        return ret;
    }

    static repli_timestamp_t entry_timestamp(const entry_t *) {
        return repli_timestamp_t::distant_past;
    }

    static size_t max_entry_size() {
        return 1 + MAX_KEY_SIZE + 1 + MAX_KEY_SIZE;
    }
};


default_block_size_t bs() { return default_block_size_t::unsafe_make(4096); }

using test_leaf_t = new_leaf_t<test_btree_t>;

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

scoped_malloc_t<void> make_live_entry(std::string key,
                                      std::string value) {
    guarantee(key.size() <= MAX_KEY_SIZE);
    guarantee(value.size() <= MAX_KEY_SIZE);
    const size_t computed_entry_size = 1 + key.size() + 1 + value.size();
    scoped_malloc_t<char> ret(computed_entry_size);

    store_key_t store_key(key);
    store_key_t store_value(value);

    keycpy(reinterpret_cast<btree_key_t *>(ret.get()),
           store_key.btree_key());
    keycpy(reinterpret_cast<btree_key_t *>(ret.get() + store_key.btree_key()->full_size()),
           store_value.btree_key());
    {
        guarantee(computed_entry_size ==
                  test_btree_t::entry_size(bs(),
                                           reinterpret_cast<test_btree_t::entry_t *>(ret.get())),
                  "computed_entry_size is %zu, real size is %zu",
                  computed_entry_size,
                  test_btree_t::entry_size(bs(),
                                           reinterpret_cast<test_btree_t::entry_t *>(ret.get())));
    }
    return scoped_malloc_reinterpret_cast<void>(std::move(ret));
}

TEST(NewLeafNodeTest, InitValidate) {
    buf_ptr_t buf = test_leaf_t::init();

    // Let's hope validate doesn't crash!  That's what this test does...
    test_leaf_t::validate(bs(), buf.sized_cache_data<main_leaf_node_t>());
}

TPTEST(NewLeafNodeTest, InsertFind) {
    test_txn_t txn;
    buf_lock_t lock(buf_parent_t(&txn), alt_create_t::create);
    buf_write_t write(&lock);
    write.set_data_write(test_leaf_t::init());

    // Check that find_key works with an empty leaf node.
    int index;
    bool found = test_leaf_t::find_key(write.get_sized_data_write<main_leaf_node_t>(),
                                       store_key_t("a").btree_key(),
                                       &index);
    ASSERT_FALSE(found);

    {
        scoped_malloc_t<void> entry = make_live_entry("b",
                                                      "abc");

        test_leaf_t::insert_entry(bs(), &write, entry.get());
    }

    // Now check that find_key works with the key we're looking for.
    found = test_leaf_t::find_key(write.get_sized_data_write<main_leaf_node_t>(),
                                       store_key_t("b").btree_key(),
                                       &index);
    ASSERT_TRUE(found);
    ASSERT_EQ(0, index);

    // And also check that it works with keys that we can't find.
    found = test_leaf_t::find_key(write.get_sized_data_write<main_leaf_node_t>(),
                                  store_key_t("a").btree_key(),
                                  &index);
    ASSERT_FALSE(found);

    found = test_leaf_t::find_key(write.get_sized_data_write<main_leaf_node_t>(),
                                  store_key_t("c").btree_key(),
                                  &index);
    ASSERT_FALSE(found);

    {
        scoped_malloc_t<void> entry = make_live_entry("c",
                                                      "def");
        test_leaf_t::insert_entry(bs(), &write, entry.get());
    }

    found = test_leaf_t::find_key(write.get_sized_data_write<main_leaf_node_t>(),
                                  store_key_t("b").btree_key(),
                                  &index);
    ASSERT_TRUE(found);
    ASSERT_EQ(0, index);

    found = test_leaf_t::find_key(write.get_sized_data_write<main_leaf_node_t>(),
                                  store_key_t("c").btree_key(),
                                  &index);
    ASSERT_TRUE(found);
    ASSERT_EQ(1, index);

    found = test_leaf_t::find_key(write.get_sized_data_write<main_leaf_node_t>(),
                                  store_key_t("bm").btree_key(),
                                  &index);
    ASSERT_FALSE(found);

    found = test_leaf_t::find_key(write.get_sized_data_write<main_leaf_node_t>(),
                                  store_key_t("d").btree_key(),
                                  &index);
    ASSERT_FALSE(found);
}

TPTEST(NewLeafNodeTest, InsertErase) {
    test_txn_t txn;
    buf_lock_t lock(buf_parent_t(&txn), alt_create_t::create);
    buf_write_t write(&lock);
    write.set_data_write(test_leaf_t::init());

    scoped_malloc_t<void> entry = make_live_entry("a", "abc");
    test_leaf_t::insert_entry(bs(), &write, entry.get());

    int index;
    bool found = test_leaf_t::find_key(write.get_sized_data_write<main_leaf_node_t>(),
                                       store_key_t("a").btree_key(),
                                       &index);
    ASSERT_TRUE(found);
    ASSERT_EQ(0, index);

    test_leaf_t::erase_presence(bs(), &write, store_key_t("a").btree_key());
    found = test_leaf_t::find_key(write.get_sized_data_write<main_leaf_node_t>(),
                                  store_key_t("a").btree_key(),
                                  &index);
    ASSERT_FALSE(found);
}

}  // namespace new_leaf_node_test

}  // namespace unittest

template class new_leaf::new_leaf_t<unittest::new_leaf_node_test::test_btree_t>;
