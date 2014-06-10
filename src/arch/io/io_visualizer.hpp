// Copyright 2010-2014 RethinkDB, all rights reserved.
#ifndef ARCH_IO_IO_VISUALIZER_HPP_
#define ARCH_IO_IO_VISUALIZER_HPP_

// TODO!
#define IO_VISUALIZER 1

#ifdef IO_VISUALIZER

#include <stdio.h>
#include <inttypes.h>

#include <string>
#include <map>
#include <vector>

#include "arch/io/concurrency.hpp"
#include "arch/timing.hpp"
#include "containers/scoped.hpp"
#include "utils.hpp"

class file_visualizer_stats_t {
public:
    file_visualizer_stats_t() {
        file_visualizer_stats_t(0);
    }
    explicit file_visualizer_stats_t(int64_t _file_size) {
        file_size = _file_size;
        vis_file_size = _file_size;
        for (size_t i = 0; i < GRANULARITY; ++i) {
            read_count[i] = 0;
            write_count[i] = 0;
        }
        resize_count = 0;
    }

    void count_read(int64_t offset) {
        ++read_count[to_bucket(offset)];
    }
    void count_write(int64_t offset) {
        ++write_count[to_bucket(offset)];
    }
    void count_resize(int64_t new_file_size) {
        ++resize_count;
        file_size = new_file_size;
        // We don't update vis_file_size. Operations at higher offsets
        // will be counted towards the highest bucket.
    }

private:
    friend class io_visualizer_t;
    friend class file_visualizer_t;

    static const size_t GRANULARITY = 100;

    size_t to_bucket(int64_t offset) const {
        if (offset >= vis_file_size) {
            return GRANULARITY-1;
        }
        const int64_t bucket_size = vis_file_size / GRANULARITY + 1;
        rassert(static_cast<size_t>(offset / bucket_size) < GRANULARITY);
        return offset / bucket_size;
    }

    int read_count[GRANULARITY];
    int write_count[GRANULARITY];
    int resize_count;
    int64_t vis_file_size;
    int64_t file_size;
};

class io_visualizer_t : public repeating_timer_callback_t {
public:
    static const int64_t UPDATE_INTERVAL_MS = 500;

    static io_visualizer_t *get_singleton() {
        static io_visualizer_t vis;
        return &vis;
    }

    void push_stats(const std::string &filename,
                       const file_visualizer_stats_t &file_stats) {
        system_mutex_t::lock_t lock(&mutex);
        if (stats.empty()) {
            timer.init(new repeating_timer_t(UPDATE_INTERVAL_MS, this));
        }
        stats[filename] = file_stats;
    }

    void unregister_file(const std::string &filename) {
        system_mutex_t::lock_t lock(&mutex);
        stats.erase(filename);
        if (stats.empty()) {
            timer.reset();
        }
    }

    void on_ring() {
        std::map<std::string, file_visualizer_stats_t> stats_copy;
        {
            system_mutex_t::lock_t lock(&mutex);
            stats_copy = stats;
        }

        // TODO! Cheap way to clear the screen
        for (int i = 0; i < 10; ++i) {
            printf("\n\n\n\n\n\n\n\n\n\n\n");
        }

        for (auto it = stats_copy.begin(); it != stats_copy.end(); ++it) {
            visualize_file(it->first, it->second);
        }
    }

private:
    io_visualizer_t() { }

    void visualize_file(const std::string &filename,
                        const file_visualizer_stats_t& file_stats) const {
        printf("\n");

        printf("%s (%" PRIi64 " MB)\n", filename.c_str(), file_stats.file_size / 1024 / 1024);

        bool some_read = false;
        bool some_write = false;
        for (size_t i = 0; i < file_stats.GRANULARITY; ++i) {
            some_read = some_read || file_stats.read_count[i] > 0;
            some_write = some_write || file_stats.write_count[i] > 0;
        }
        printf(" ");
        if (file_stats.resize_count > 0) {
            printf(" [RES]");
        } else {
            printf(" [   ]");
        }
        if (some_read) {
            printf(" [RD]");
        } else {
            printf(" [  ]");
        }
        if (some_write) {
            printf(" [WR]");
        } else {
            printf(" [  ]");
        }
        printf("\n");

        for (int bar_y = 1 << 12; bar_y > 0; bar_y /= 4) {
            printf("  |");
            for (size_t i = 0; i < file_stats.GRANULARITY; ++i) {
                char cell = generate_bar_cell(file_stats, i, bar_y);
                printf("%c", cell);
            }
            printf("\n");
        }
        printf("  |");
        for (size_t i = 0; i < file_stats.GRANULARITY; ++i) {
            printf("_");
        }
        printf("\n");
    }

    char generate_bar_cell(const file_visualizer_stats_t& file_stats,
                           const int bar_x, const int bar_y) const {
        const bool read = file_stats.read_count[bar_x] > bar_y/4
                          && file_stats.read_count[bar_x] <= bar_y;
        const bool write = file_stats.write_count[bar_x] > bar_y/4
                           && file_stats.write_count[bar_x] <= bar_y;
        const bool read_above = file_stats.read_count[bar_x] > bar_y/4;
        const bool write_above = file_stats.write_count[bar_x] > bar_y/4;
        if (read && write) {
            return '~';
        } else if (read && !write_above) {
            return '.';
        } else if (write && !read_above) {
            return '_';
        } else if (write_above) {
            return '|';
        } else if (read_above) {
            return ':';
        } else {
            return ' ';
        }
    }

    system_mutex_t mutex;
    std::map<std::string, file_visualizer_stats_t> stats;
    scoped_ptr_t<repeating_timer_t> timer;

    DISABLE_COPYING(io_visualizer_t);
};

class file_visualizer_t : public repeating_timer_callback_t {
public:
    static const int64_t UPDATE_INTERVAL_MS = 1000;

    file_visualizer_t(const std::string &_filename, int64_t file_size) :
        filename(_filename),
        stats(file_size),
        timer(UPDATE_INTERVAL_MS, this) { }

    ~file_visualizer_t() {
        io_visualizer_t::get_singleton()->unregister_file(filename);
    }

    void on_ring() {
        int64_t file_size = stats.file_size;
        io_visualizer_t::get_singleton()->push_stats(filename, stats);
        stats = file_visualizer_stats_t(file_size);
    }

    void count_read(int64_t offset) {
        stats.count_read(offset);
    }
    void count_write(int64_t offset) {
        stats.count_write(offset);
    }
    void count_resize(int64_t new_file_size) {
        stats.count_resize(new_file_size);
    }

private:
    std::string filename;
    file_visualizer_stats_t stats;
    repeating_timer_t timer;
};

#endif // IO_VISUALIZER

#endif // ARCH_IO_IO_VISUALIZER_HPP_
