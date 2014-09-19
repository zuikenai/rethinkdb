#include "btree/new_leaf.hpp"

#include "btree/keys.hpp"
#include "btree/leaf_structure.hpp"
#include "buffer_cache/sized_ptr.hpp"
#include "serializer/buf_ptr.hpp"

// There is no instantiation for entry_t anywhere.
namespace new_leaf {

struct entry_t;

struct orig_btree_t {
    static int compare_key_to_entry(const btree_key_t *, const entry_t *) {
        // RSI: Implement this.
        return 0;
    }
};

const entry_t *get_entry(const main_leaf_node_t *node, int offset) {
    return reinterpret_cast<const entry_t *>(reinterpret_cast<const char *>(node) + offset);
}

const entry_t *entry_for_index(const main_leaf_node_t *node, int index) {
    return get_entry(node, node->pair_offsets[index]);
}

template <class btree_type>
buf_ptr_t new_leaf_t<btree_type>::init() {
    static_assert(sizeof(main_leaf_node_t) == offsetof(main_leaf_node_t, pair_offsets),
                  "Weird main_leaf_node_t packing.");
    buf_ptr_t ret = buf_ptr_t::alloc_uninitialized(
            block_size_t::make_from_cache(sizeof(main_leaf_node_t)));
    main_leaf_node_t *p = static_cast<main_leaf_node_t *>(ret.cache_data());
    p->magic = main_leaf_node_t::expected_magic;
    p->num_pairs = 0;
    p->live_entry_size = 0;
    p->dead_entry_size = 0;
    p->frontmost = offsetof(main_leaf_node_t, pair_offsets);
    return ret;
}


// Sets *index_out to the index for the live entry or deletion entry
// for the key, or to the index the key would have if it were
// inserted.  Returns true if the key at said index is actually equal.
template <class btree_type>
bool new_leaf_t<btree_type>::find_key(
        sized_ptr_t<const main_leaf_node_t> node,
        const btree_key_t *key,
        int *index_out) {
    int beg = 0;
    int end = node.buf->num_pairs;

    // beg == 0 or key > *(beg - 1).
    // end == num_pairs or key < *end.

    while (beg < end) {
        // when (end - beg) > 0, (end - beg) / 2 is always less than (end - beg).  So beg <= test_point < end.
        int test_point = beg + (end - beg) / 2;

        int res = btree_type::compare_key_to_entry(
                key,
                entry_for_index(node.buf, test_point));

        if (res < 0) {
            // key < *test_point.
            end = test_point;
        } else if (res > 0) {
            // key > *test_point.  Since test_point < end, we have test_point + 1 <= end.
            beg = test_point + 1;
        } else {
            // We found the key!
            *index_out = test_point;
            return true;
        }
    }

    // (Since beg == end, then *(beg - 1) < key < *beg (with appropriate
    // provisions for beg == 0 or beg == num_pairs) and index_out
    // should be set to beg, and false should be returned.
    *index_out = beg;
    return false;

}

template struct new_leaf_t<orig_btree_t>;

}  // namespace new_leaf
