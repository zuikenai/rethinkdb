// Copyright 2010-2014 RethinkDB, all rights reserved.
#ifndef SERIALIZER_LOG_CONFIG_HPP_
#define SERIALIZER_LOG_CONFIG_HPP_

#include <string>

#include "config/args.hpp"
#include "containers/archive/archive.hpp"
#include "serializer/types.hpp"

/* Configuration for the serializer that can change from run to run */

struct log_serializer_dynamic_config_t {
    log_serializer_dynamic_config_t() {
        read_ahead = true;
        io_batch_factor = DEFAULT_IO_BATCH_FACTOR;
    }

    /* The (minimal) batch size of i/o requests being taken from a single i/o account.
    It is a factor because the actual batch size is this factor multiplied by the
    i/o priority of the account. */
    int32_t io_batch_factor;

    /* Enable reading more data than requested to let the cache warmup more quickly esp. on rotational drives */
    bool read_ahead;
};

/* This is equivalent to log_serializer_static_config_t below, but is an on-disk
structure. Changes to this change the on-disk database format! */
struct log_serializer_on_disk_static_config_t {
    // This value is ALWAYS 4096 (the value of DEFAULT_DEFAULT_BTREE_BLOCK_SIZE).
    uint64_t default_block_size_;

    // Maybe this value could vary, I don't know.
    uint64_t extent_size_;

    // A helper.
    uint64_t extent_index(int64_t offset) const { return offset / extent_size_; }

    // Minimize calls to these.
    default_block_size_t default_block_size() const {
        return default_block_size_t::unsafe_make(default_block_size_);
    }
    uint64_t extent_size() const { return extent_size_; }
} __attribute__((__packed__));

/* Configuration for the serializer that is set when the database is created */
struct log_serializer_static_config_t : public log_serializer_on_disk_static_config_t {
    log_serializer_static_config_t() {
        extent_size_ = DEFAULT_EXTENT_SIZE;
        default_block_size_ = DEFAULT_DEFAULT_BTREE_BLOCK_SIZE;
    }
};

#endif /* SERIALIZER_LOG_CONFIG_HPP_ */

