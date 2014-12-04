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

std::vector<int16_t> user_to_kevent(int mode) {

    rassert((mode & (poll_event_in | poll_event_out)) == mode);

    std::vector<int16_t> filters;
    if (mode == poll_event_in) filters.push_back(EVFILT_READ);
    if (mode == poll_event_out) filters.push_back(EVFILT_WRITE);

    return filters;
}

int kevent_to_user(int16_t mode) {
    rassert(mode == EVFILT_READ || mode == EVFILT_WRITE);

    if (mode == EVFILT_READ) return poll_event_in;
    if (mode == EVFILT_WRITE) return poll_event_out;
    unreachable();
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
        struct kevent ev;
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
        if (res == 1 && ev.filter != 0) {
            linux_event_callback_t *cb = callbacks[ev.ident];
            cb->on_event(kevent_to_user(ev.filter));
        }

        parent->pump();
    }
}

kqueue_event_queue_t::~kqueue_event_queue_t() {
    // TODO!
    close(kqueue_fd);
}

void kqueue_event_queue_t::watch_resource(fd_t resource, int watch_mode, linux_event_callback_t *cb) {
    rassert(cb);

    std::vector<int16_t> filters = user_to_kevent(watch_mode);
    for (auto filter : filters) {
      struct kevent ev;
      EV_SET(&ev, resource, filter, EV_ADD, 0, 0, NULL);

      // TODO! Return code etc.
      // Start watching this event
      kevent(kqueue_fd, &ev, 1, NULL, 0, NULL);

      watched_events.push_back(ev);
    }

    callbacks[resource] = cb;
}

void kqueue_event_queue_t::adjust_resource(fd_t resource, int events, linux_event_callback_t *cb) {
    // TODO! This might be incorrect?
    forget_resource(resource, cb);
    watch_resource(resource, events, cb);
}

void kqueue_event_queue_t::forget_resource(fd_t resource, DEBUG_VAR linux_event_callback_t *cb) {
    rassert(cb);

    // Erase the callback from the map
    callbacks.erase(resource);

    // Find and erase the event
    for (unsigned int i = 0; i < watched_events.size(); i++) {
        if (watched_events[i].ident == (uintptr_t)resource) {
            struct kevent ev = watched_events[i];
            ev.flags = EV_DELETE;
            // TODO! Return code etc.
            // Stop watching the event
            kevent(kqueue_fd, &ev, 1, NULL, 0, NULL);

            watched_events.erase(watched_events.begin() + i);
        }
    }

}
