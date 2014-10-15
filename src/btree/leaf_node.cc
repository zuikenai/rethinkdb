#include "btree/leaf_node.hpp"

#include "btree/leaf_structure.hpp"
#include "btree/main_btree.hpp"
#include "btree/new_leaf.hpp"

namespace leaf {

void validate(value_sizer_t *sizer, sized_ptr_t<const leaf_node_t> node) {
    if (node.buf->magic == leaf_node_t::expected_magic) {
        old_leaf::validate(sizer, node.buf);
    } else if (node.buf->magic == main_leaf_node_t::expected_magic) {
        new_leaf_t<main_btree_t>::validate(
                sizer->default_block_size(),
                sized_reinterpret_cast<const main_leaf_node_t>(node));
    } else {
        rassert(false, "B-tree leaf node has invalid magic value.");
    }
}



}  // namespace leaf

