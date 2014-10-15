#include "btree/leaf_node.hpp"

#include "btree/leaf_structure.hpp"
#include "btree/main_btree.hpp"
#include "btree/new_leaf.hpp"

namespace leaf {

using main_leaf_t = new_leaf_t<main_btree_t>;

inline bool is_old(sized_ptr_t<const leaf_node_t> node) {
    return node.buf->magic == leaf_node_t::expected_magic;
}

inline bool is_new(sized_ptr_t<const leaf_node_t> node) {
    return node.buf->magic == main_leaf_node_t::expected_magic;
}

inline sized_ptr_t<const main_leaf_node_t> as_new(sized_ptr_t<const leaf_node_t> node) {
    rassert(is_new(node));
    return sized_reinterpret_cast<const main_leaf_node_t>(node);
}

inline sized_ptr_t<main_leaf_node_t> as_new(sized_ptr_t<leaf_node_t> node) {
    rassert(is_new(node));
    return sized_reinterpret_cast<main_leaf_node_t>(node);
}

void validate(value_sizer_t *sizer, sized_ptr_t<const leaf_node_t> node) {
    if (is_old(node)) {
        old_leaf::validate(sizer, node.buf);
    } else {
        main_leaf_t::validate(sizer->default_block_size(), as_new(node));
    }
}

bool is_empty(sized_ptr_t<const leaf_node_t> node) {
    if (is_old(node)) {
        return old_leaf::is_empty(node.buf);
    } else {
        return main_leaf_t::is_empty(as_new(node));
    }
}


}  // namespace leaf

