// Copyright 2010-2014 RethinkDB, all rights reserved.
#ifndef BTREE_LEAF_ITERATION_HPP_
#define BTREE_LEAF_ITERATION_HPP_

#include "btree/old_leaf.hpp"
#include "btree/leaf_structure.hpp"
#include "btree/main_btree.hpp"
#include "btree/new_leaf.hpp"

namespace leaf {

using main_leaf_t = new_leaf_t<main_btree_t>;

// We define templated iteration methods here instead of having some leaf::iterator
// type that repeats the is-old/is-new check every time.

template <class Callable>
void iterate_live_entries(sized_ptr_t<const leaf_node_t> node, Callable &&cb) {
    if (is_old(node.buf)) {
        for (old_leaf::iterator it = leaf::begin(node.buf), e = leaf::end(node.buf);
             it != e;
             it.step()) {
            std::pair<const btree_key_t *, const void *> p = *it;
            if (!cb(p.first, p.second)) {
                break;
            }
        }
    } else {
        for (main_leaf_t::live_iter_t it(as_new(node)); !it.at_end(); it.step()) {
            const new_leaf::entry_t *entry
                = static_cast<const new_leaf::entry_t *>(it.entry());
            leaf::entry_ptrs_t ptrs = main_btree_t::entry_ptrs(entry);
            rassert(ptrs.value_or_null != nullptr);
            if (!cb(ptrs.key, ptrs.value_or_null)) {
                break;
            }
        }
    }
}

}  // namespace leaf

#endif  // BTREE_LEAF_ITERATION_HPP_
