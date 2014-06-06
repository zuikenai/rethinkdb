# Copyright 2014 RethinkDB, all rights reserved.

PY_SRC_DIR = $(TOP)/drivers/python
PY_BUILD_DIR = $(TOP)/build/drivers/python
PY_PKG_DIR = $(TOP)/build/packages/python

PY_PROTO_FILE_NAME = ql2_pb2.py

PY_PROTO_BUILD_FILE := $(PY_BUILD_DIR)/rethinkdb/$(PY_PROTO_FILE_NAME)
# convenience file for driver development
PY_PROTO_DEV_FILE := $(PY_SRC_DIR)/rethinkdb/$(PY_PROTO_FILE_NAME)

PY_SRC_FILES := $(filter-out $(PY_SRC_DIR)/rethinkdb/$(PY_PROTO_FILE_NAME),$(wildcard $(PY_SRC_DIR)/rethinkdb/*.py))
PY_BUILD_FILES := $(patsubst $(PY_SRC_DIR)/rethinkdb/%,$(PY_BUILD_DIR)/rethinkdb/%,$(PY_SRC_FILES)) $(PY_PROTO_BUILD_FILE)

.PHONY: py-driver py-clean py-publish py-sdist py-install
py-driver: $(PY_BUILD_FILES) $(PY_PROTO_DEV_FILE) | $(PY_BUILD_DIR)/.

$(PY_BUILD_DIR)/rethinkdb/%: $(PY_SRC_DIR)/rethinkdb/% py_build_files
	cp $< $@

.INTERMEDIARY: py_build_files
py_build_files: $(PY_BUILD_DIR)/rethinkdb/.
	$P CP $(PY_BUILD_DIR)/rethinkdb/

%/$(PY_PROTO_FILE_NAME): $(PROTO_FILE_SRC) %/.
	$P CONVERT_PROTOFILE
	$(PYTHON) ../convert_protofile --language python --input-file $(PROTO_FILE_SRC) --output-file $@

$(PY_BUILD_DIR)/setup.py: $(PY_SRC_DIR)/setup.py | $(PY_BUILD_DIR)
	$P CP
	cp $< $@

py-clean:
	$P RM $(PY_BUILD_DIR)
	rm -rf $(PY_BUILD_DIR)
	$P RM $(PY_PKG_DIR)
	rm -rf $(PY_PKG_DIR)
	$P RM $(PY_PROTO_DEV_FILE)
	rm -f $(PY_PROTO_DEV_FILE)

py-sdist: py-driver $(PY_BUILD_DIR)/setup.py | $(PY_PKG_DIR)/.
	$P SDIST
	cp $? $(PY_BUILD_DIR)
	cd $(PY_BUILD_DIR) && python setup.py sdist --dist-dir=$(abspath $(PY_PKG_DIR))

py-bdist: py-driver $(PY_BUILD_DIR)/setup.py | $(PY_PKG_DIR)/.
	$P BDIST_EGG
	cp $? $(PY_BUILD_DIR)
	cd $(PY_BUILD_DIR) && python setup.py bdist_egg --dist-dir=$(abspath $(PY_PKG_DIR))

py-publish: py-driver $(PY_BUILD_DIR)/setup.py | $(PY_PKG_DIR)/.
	$P REGISTER SDIST
	cp $? $(PY_BUILD_DIR)
	cd $(PY_BUILD_DIR) && python setup.py register sdist --dist-dir=$(abspath $(PY_PKG_DIR)) upload 

py-install: py-driver $(PY_BUILD_DIR)/setup.py | $(PY_PKG_DIR)/.
	$P INSTALL
	cp $? $(PY_BUILD_DIR)
	cd $(PY_BUILD_DIR) && python setup.py install
