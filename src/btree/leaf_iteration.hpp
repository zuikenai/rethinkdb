// Copyright 2010-2014 RethinkDB, all rights reserved.
#ifndef BTREE_LEAF_ITERATION_HPP_
#define BTREE_LEAF_ITERATION_HPP_

#include "btree/old_leaf.hpp"
#include "btree/leaf_node.hpp"
#include "btree/leaf_structure.hpp"
#include "btree/main_btree.hpp"
#include "btree/new_leaf.hpp"

namespace leaf {

using main_leaf_t = new_leaf_t<main_btree_t>;

// We define templated iteration methods here instead of having some leaf::iterator
// type that repeats the is-old/is-new check every time.

template <class Callable>
void iterate_live_entries(sized_ptr_t<const leaf_node_t> node,
                          leaf_node_index_t begin,
                          leaf_node_index_t end,
                          Callable &&cb) {
    if (is_old(node)) {
        for (old_leaf::iterator
                 it = old_leaf::iterator(node.buf, begin.value()),
                 e = old_leaf::iterator(node.buf, end.value());
             it != e;
             it.step()) {
            std::pair<const btree_key_t *, const void *> p = *it;
            if (!cb(p.first, p.second)) {
                break;
            }
        }
    } else {
        for (main_leaf_t::live_iter_t it(as_new(node), begin.value());
             it.index() != end.value();
             it.step()) {
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


template <class Callable>
void iterate_live_entries(sized_ptr_t<const leaf_node_t> node, Callable &&cb) {
    iterate_live_entries(node, leaf::begin(node), leaf::end(node),
                         std::forward<Callable>(cb));
}

template <class Callable>
void reverse_iterate_live_entries(sized_ptr_t<const leaf_node_t> node,
                                  leaf_node_index_t begin,
                                  leaf_node_index_t end,
                                  Callable &&cb) {
    if (is_old(node)) {
        old_leaf::iterator it = old_leaf::iterator(node.buf, end.value());
        const old_leaf::iterator b = old_leaf::iterator(node.buf, begin.value());

        for (;;) {
            if (it == b) {
                return;
            }

            it.step_backward();

            std::pair<const btree_key_t *, const void *> p = *it;
            if (!cb(p.first, p.second)) {
                break;
            }
        }
    } else {
        main_leaf_t::live_iter_t it(as_new(node), end.value());
        while (it.index() != begin.value()) {
            it.step_backward();
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
