// Copyright 2010-2014 RethinkDB, all rights reserved.
#include "btree/node.hpp"

#include "btree/leaf_node.hpp"
#include "btree/internal_node.hpp"
#include "buffer_cache/alt.hpp"
#include "containers/sized_ptr.hpp"

const block_magic_t btree_superblock_t::expected_magic = { { 's', 'u', 'p', 'e' } };
const block_magic_t internal_node_t::expected_magic = { { 'i', 'n', 't', 'e' } };

static_assert(btree_superblock_t::METAINFO_BLOB_MAXREFLEN > 0,
              "Metainfo blobs should be of non-zero size.");
static_assert(from_cache_block_size_t<sizeof(btree_superblock_t)>::ser_size == DEVICE_BLOCK_SIZE,
              "btree_superblock_t should be exactly DEVICE_BLOCK_SIZE (you can't "
              "get smaller/better than that).");

namespace node {

bool is_underfull(value_sizer_t *sizer, const node_t *node) {
    if (is_leaf(node)) {
        return leaf::is_underfull(sizer, reinterpret_cast<const leaf_node_t *>(node));
    } else {
        rassert(is_internal(node));
        return internal_node::is_underfull(sizer->default_block_size(),
                                           reinterpret_cast<const internal_node_t *>(node));
    }
}

bool is_mergable(value_sizer_t *sizer, const node_t *node, const node_t *sibling, const internal_node_t *parent) {
    if (is_leaf(node)) {
        return leaf::is_mergable(sizer, reinterpret_cast<const leaf_node_t *>(node), reinterpret_cast<const leaf_node_t *>(sibling));
    } else {
        rassert(is_internal(node));
        return internal_node::is_mergable(sizer->default_block_size(),
                                          reinterpret_cast<const internal_node_t *>(node),
                                          reinterpret_cast<const internal_node_t *>(sibling),
                                          parent);
    }
}

void split(value_sizer_t *sizer, buf_write_t *node,
           buf_ptr_t *rnode_out, store_key_t *median_out) {
    sized_ptr_t<node_t> node_ptr = node->get_sized_data_write<node_t>();
    if (is_leaf(node_ptr.buf)) {
        leaf::split(sizer, node, rnode_out, median_out);
    } else {
        rassert(node_ptr.block_size == sizer->default_block_size().value());
        buf_ptr_t ptr = buf_ptr_t::alloc_zeroed(sizer->default_block_size());
        internal_node::split(sizer->default_block_size(),
                             reinterpret_cast<internal_node_t *>(node_ptr.buf),
                             static_cast<internal_node_t *>(ptr.cache_data()),
                             median_out);
        *rnode_out = std::move(ptr);
    }
}

void merge(value_sizer_t *sizer, buf_write_t *node, buf_write_t *rnode,
           const internal_node_t *parent) {
    sized_ptr_t<node_t> node_ptr = node->get_sized_data_write<node_t>();
    if (is_leaf(node_ptr.buf)) {
        leaf::merge(sizer, node, rnode);
    } else {
        rassert(node_ptr.block_size == sizer->default_block_size().value());
        internal_node::merge(sizer->default_block_size(),
                             reinterpret_cast<internal_node_t *>(node_ptr.buf),
                             reinterpret_cast<internal_node_t *>(rnode->get_data_write()),
                             parent);
    }
}

void validate(DEBUG_VAR value_sizer_t *sizer, DEBUG_VAR sized_ptr_t<const node_t> node) {
#ifndef NDEBUG
    if (is_leaf(node.buf)) {
        leaf::validate(sizer, sized_reinterpret_cast<const leaf_node_t>(node));
    } else if (node.buf->magic == internal_node_t::expected_magic) {
        internal_node::validate(sizer->default_block_size(),
                                reinterpret_cast<const internal_node_t *>(node.buf));
    } else {
        unreachable("Invalid leaf node type.");
    }
#endif
}

}  // namespace node
