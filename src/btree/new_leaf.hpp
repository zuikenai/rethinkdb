// Copyright 2010-2014 RethinkDB, all rights reserved.
#ifndef BTREE_NEW_LEAF_HPP_
#define BTREE_NEW_LEAF_HPP_

template <class> class sized_ptr_t;
struct btree_key_t;
class buf_ptr_t;
struct main_leaf_node_t;
class value_sizer_t;

namespace new_leaf {

struct orig_btree_t;

template <class btree_type>
struct new_leaf_t {
    static buf_ptr_t init();
    static bool find_key(
            sized_ptr_t<const main_leaf_node_t> node,
            const btree_key_t *key,
            int *index_out);

#ifndef NDEBUG
    void validate(value_sizer_t *sizer, sized_ptr_t<const main_leaf_node_t> node);
#else
    void validate(value_sizer_t *, sized_ptr_t<const main_leaf_node_t>) { }
#endif
};

}  // namespace new_leaf

#endif /* BTREE_NEW_LEAF_HPP_ */
