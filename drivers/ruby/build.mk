# Copyright 2014 RethinkDB, all rights reserved.

RB_SRC_DIR = $(TOP)/drivers/ruby
RB_BUILD_DIR = $(TOP)/build/drivers/ruby
RB_PKG_DIR = $(TOP)/build/packages/ruby

RB_PROTO_FILE_NAME = ql2.pb.rb
RB_GEMSPEC_FILE = $(RB_SRC_DIR)/rethinkdb.gemspec

RB_PROTO_BUILD_FILE := $(RB_BUILD_DIR)/lib/$(RB_PROTO_FILE_NAME)
# convenience file for driver development
RB_PROTO_DEV_FILE := $(RB_SRC_DIR)/lib/$(RB_PROTO_FILE_NAME)

RB_SRC_FILES := $(filter-out $(RB_SRC_DIR)/lib/$(RB_PROTO_FILE_NAME),$(wildcard $(RB_SRC_DIR)/lib/*.rb))
RB_BUILD_FILES := $(patsubst $(RB_SRC_DIR)/lib/%,$(RB_BUILD_DIR)/lib/%,$(RB_SRC_FILES)) $(RB_PROTO_BUILD_FILE)

.PHONY: rb-driver
rb-driver: $(RB_BUILD_FILES) $(RB_PROTO_DEV_FILE)

$(RB_BUILD_DIR)/lib/%: $(RB_SRC_DIR)/lib/% rb_build_files
	cp $< $@

.INTERMEDIARY: rb_build_files
rb_build_files: $(RB_BUILD_DIR)/lib/.
	$P CP $(RB_BUILD_DIR)/lib

%/$(RB_PROTO_FILE_NAME): $(PROTO_FILE_SRC) %/.
	$P CONVERT_PROTOFILE
	$(PYTHON) ../convert_protofile --language ruby --input-file $(PROTO_FILE_SRC) --output-file $@

.PHONY: rb-publish
GEMFILES = $(wildcard $(RB_SRC_DIR)/rethinkdb-*.gem)
rb-publish: $(RB_GEMSPEC_FILE) rb-driver
	$P PUBLISH
	$(if $(GEMFILES), $(error Can not publish: a gem file already exists: $(GEMFILES)))
	cp $(RB_GEMSPEC_FILE) $(RB_BUILD_DIR)
	cd $(RB_BUILD_DIR) && gem build $(GEMSPEC)
	cd $(RB_BUILD_DIR) && gem push rethinkdb-*.gem

.PHONY: rb-clean
rb-clean:
	$P RM $(RB_BUILD_DIR)
	rm -rf $(RB_BUILD_DIR)
	$P RM $(RB_PROTO_DEV_FILE)
	rm -f $(RB_PROTO_DEV_FILE)
