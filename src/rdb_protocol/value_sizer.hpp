#ifndef RDB_PROTOCOL_VALUE_SIZER_HPP_
#define RDB_PROTOCOL_VALUE_SIZER_HPP_

#include "btree/node.hpp"

struct rdb_value_t;

class rdb_value_sizer_t : public value_sizer_t {
public:
    explicit rdb_value_sizer_t(default_block_size_t bs);

    static const rdb_value_t *as_rdb(const void *p);

    int size(const void *value) const;

    bool fits(const void *value, int length_available) const;

    int max_possible_size() const;

    default_block_size_t default_block_size() const;

private:
    // The block size.  It's convenient for leaf node code and for
    // some subclasses, too.
    default_block_size_t block_size_;

    DISABLE_COPYING(rdb_value_sizer_t);
};

bool btree_value_fits(default_block_size_t bs, int data_length, const rdb_value_t *value);

#endif  // RDB_PROTOCOL_VALUE_SIZER_HPP_
