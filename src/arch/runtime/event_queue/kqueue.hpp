// Copyright 2010-2014 RethinkDB, all rights reserved.
#ifndef ARCH_RUNTIME_EVENT_QUEUE_KQUEUE_HPP_
#define ARCH_RUNTIME_EVENT_QUEUE_KQUEUE_HPP_

// TODO!

#include <map>
#include <vector>

#include "arch/runtime/event_queue_types.hpp"
#include "arch/runtime/runtime_utils.hpp"
#include "errors.hpp"

// Event queue structure
class kqueue_event_queue_t {
public:
    explicit kqueue_event_queue_t(linux_queue_parent_t *parent);
    void run();
    ~kqueue_event_queue_t();

    // These should only be called by the event queue itself or by the linux_* classes
    void watch_resource(fd_t resource, int events, linux_event_callback_t *cb);
    void adjust_resource(fd_t resource, int events, linux_event_callback_t *cb);
    void forget_resource(fd_t resource, linux_event_callback_t *cb);

private:
    linux_queue_parent_t *parent;

    fd_t kqueue_fd;
    std::vector<kevent> watched_events;

    std::map<fd_t, linux_event_callback_t *> callbacks;

    DISABLE_COPYING(poll_event_queue_t);
};


#endif // ARCH_RUNTIME_EVENT_QUEUE_KQUEUE_HPP_
