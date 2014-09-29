#ifndef UNITTEST_LEAF_NODE_TEST_HPP_
#define UNITTEST_LEAF_NODE_TEST_HPP_

#include "btree/node.hpp"
#include "debug.hpp"

namespace unittest {

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


}  // namespace unittest


#endif  // UNITTEST_LEAF_NODE_TEST_HPP_

