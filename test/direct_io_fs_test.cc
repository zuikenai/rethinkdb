/*
Tests if direct io works properly on a given file system.

From the man page for write(2):
"POSIX requires that a read(2) which can be proved to occur after a write() has returned returns the new
 data.  Note that not all file systems are POSIX conforming."

We test whether this holds with O_DIRECT on the given file system
*/

#include <iostream>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <stdlib.h>
#include <malloc.h>

int main(int argc, char **argv) {
    if (argc != 2) {
        std::cerr << "Wrong number of arguments (expected 1).\nPlease call " << argv[0] << " <file>\n";
        return 1;
    }

    int fd = open(argv[1], O_RDWR | O_CREAT | O_DIRECT, 0644);
    if (fd == -1) {
        std::cerr << "Could not open file (errno " << errno << ")\n";
        return 2;
    }

    const size_t block_size = 512;
    const size_t max_blocks = 1024 * 64;
    const size_t max_size = block_size * max_blocks;
    if (ftruncate(fd, max_size) != 0) {
        std::cerr << "Could not ftruncate file (errno " << errno << ")\n";
        return 2;
    }


    // Write a random amount of random data to the file. Read it back immediately and verify.
    const int num_runs = 100;
    for (int r = 0; r < num_runs; ++r) {
        const size_t data_size = (random() % max_blocks + 1) * block_size;

        char *data = (char *)memalign(4096, data_size);
        for (size_t i = 0; i < data_size; ++i) {
            data[i] = static_cast<char>(random());
        }

        size_t amount_written = 0;
        while (amount_written < data_size) {
            ssize_t res = pwrite(fd, data + amount_written, data_size - amount_written, amount_written);
            if (res == -1) {
                std::cerr << "Write failed (errno " << errno << ")\n";
                return 2;
            }
            amount_written += res;
        }

        char *read_data = (char *)memalign(4096, data_size);
        size_t amount_read = 0;
        while (amount_read < data_size) {
            ssize_t res = pread(fd, read_data + amount_read, data_size - amount_read, amount_read);
            if (res == -1) {
                std::cerr << "Read failed (errno " << errno << ")\n";
                return 2;
            }
            amount_read += res;
        }

        for (size_t i = 0; i < data_size; ++i) {
            if (read_data[i] != data[i]) {
                std::cerr << "Data mismatch\n";
                return -1;
            }
        }
        free(read_data);
        free(data);
    }

    return 0;
}

