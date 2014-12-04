// Copyright 2010-2014 RethinkDB, all rights reserved.
#include "arch/runtime/event_queue/kqueue.hpp"

// TODO!
#include <sys/types.h>
#include <sys/event.h>
#include <sys/time.h>
#include <unistd.h>
#include <sched.h>
#include <stdio.h>
#include <errno.h>
#include <poll.h>
#include <string.h>

#include <new>
#include <algorithm>
#include <string>


#include "config/args.hpp"
#include "utils.hpp"
#include "arch/runtime/event_queue.hpp"
#include "arch/runtime/thread_pool.hpp"
#include "arch/io/timer_provider.hpp"
#include "perfmon/perfmon.hpp"

int16_t user_to_kevent(int mode) {

    DEBUG_VAR int allowed_mode_mask = poll_event_in | poll_event_out;

    rassert((mode & allowed_mode_mask) == mode);

    int out_mode = 0;
    if (mode & poll_event_in) out_mode |= EVFILT_READ;
    if (mode & poll_event_out) out_mode |= EVFILT_WRITE;

    return out_mode;
}

int kevent_to_user(int16_t mode) {

    DEBUG_VAR int allowed_mode_mask = POLLIN | POLLOUT | POLLERR | POLLHUP;

    rassert((mode & allowed_mode_mask) == mode);

    int out_mode = 0;
    if (mode & EVFILT_READ) out_mode |= poll_event_in;
    if (mode & EVFILT_WRITE) out_mode |= poll_event_out;

    return out_mode;
}

kqueue_event_queue_t::kqueue_event_queue_t(linux_queue_parent_t *_parent)
    : parent(_parent) {

    // TODO!
    kqueue_fd = kqueue();
}

void kqueue_event_queue_t::run() {
    int res;

// TODO! signal timer provider stuff

    // Now, start the loop
    while (!parent->should_shut_down()) {
        // Grab the events from the kernel!
        // TODO! Use batching
        kevent ev;
        res = kevent(kqueue_fd, NULL, 0, &ev, 1, NULL);

        // TODO!
        /*// ppoll might return with EINTR in some cases (in particular
        // under GDB), we just need to retry.
        if (res == -1 && get_errno() == EINTR) {
            res = 0;
        }*/

        // TODO! Are there other errors we can handle?
        guarantee_err(res != -1, "Waiting for kqueue events failed");

        block_pm_duration event_loop_timer(pm_eventloop_singleton_t::get());

        // TODO! Loop
        linux_event_callback_t *cb = callbacks[ev.ident];
        cb->on_event(kevent_to_user(ev.filter));

        parent->pump();
    }
}

kqueue_event_queue_t::~kqueue_event_queue_t() {
    // TODO!
    close(kqueue_fd);
}

void kqueue_event_queue_t::watch_resource(fd_t resource, int watch_mode, linux_event_callback_t *cb) {
    rassert(cb);

    kevent ev;
    EV_SET(&ev, resource, user_to_kevent(watch_mode), EV_ADD, 0, 0, NULL);

    // TODO! Return code etc.
    // Start watching this event
    kevent(kqueue_fd, &ev, 1, NULL, 0, NULL);

    watched_events.push_back(pfd);
    callbacks[resource] = cb;
}

void kqueue_event_queue_t::adjust_resource(fd_t resource, int events, linux_event_callback_t *cb) {
    kevent ev;
    EV_SET(&ev, resource, user_to_kevent(watch_mode), EV_ADD, 0, 0, NULL);

    // TODO! Return code etc.
    // Update the watched event
    kevent(kqueue_fd, &ev, 1, NULL, 0, NULL);

    // Find and adjust the event
    callbacks[resource] = cb;
    for (unsigned int i = 0; i < watched_fds.size(); i++) {
        if (watched_events[i].ident == resource) {
            watched_events[i] = ev;
            return;
        }
    }
}

void kqueue_event_queue_t::forget_resource(fd_t resource, DEBUG_VAR linux_event_callback_t *cb) {
    rassert(cb);

    // Erase the callback from the map
    callbacks.erase(resource);

    // Find and erase the event
    for (unsigned int i = 0; i < watched_events.size(); i++) {
        if (watched_events[i].ident == resource) {
            kevent ev = watched_events[i];
            ev.flags = EV_DELETE;
            // TODO! Return code etc.
            // Stop watching the event
            kevent(kqueue_fd, &ev, 1, NULL, 0, NULL);

            watched_events.erase(watched_events.begin() + i);
            return;
        }
    }

}
