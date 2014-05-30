RETHINKDB_HOME=../..
PROTO_FILE_SRC=$(RETHINKDB_HOME)/src/rdb_protocol/ql2.proto
PY_PKG_DIR=$(RETHINKDB_HOME)/build/packages/python
PY_BUILD_DIR=$(RETHINKDB_HOME)/build/drivers/python

PYTHON_PB_FILE=$(PY_BUILD_DIR)/rethinkdb/ql2_pb2.py

all: $(PYTHON_PB_FILE) $(PROTO_FILE_SRC) $(PY_BUILD_DIR)

$(PY_BUILD_DIR):
	mkdir -p $(PY_BUILD_DIR)
	rsync -a --exclude *.pyc rethinkdb/ $(PY_BUILD_DIR)/rethinkdb

$(PYTHON_PB_FILE): $(PROTO_FILE_SRC) $(PY_BUILD_DIR)
	../convert_protofile --language python --input-file $(PROTO_FILE_SRC) --output-file $(PYTHON_PB_FILE)
	# TODO: remove this when nothing trys to use it
	cp $(PYTHON_PB_FILE) rethinkdb/

clean:
	rm -rf $(PY_BUILD_DIR)
	rm -rf $(PY_PKG_DIR)
	# TODO: remove this when removing above
	rm -f rethinkdb/$(basename $(PYTHON_PB_FILE))

sdist: $(PYTHON_PB_FILE) $(PY_BUILD_DIR)
	mkdir -p $(PY_PKG_DIR)
	cp setup.py $(PY_PKG_DIR)
	rsync -a --delete --exclude *.pyc --delete-excluded $(PY_BUILD_DIR)/rethinkdb $(PY_PKG_DIR)/rethinkdb
	cd $(PY_PKG_DIR) && python setup.py sdist

bdist: 
	mkdir -p $(PY_PKG_DIR)
	cp setup.py $(PY_PKG_DIR)
	rsync -a --delete --exclude *.pyc --delete-excluded $(PY_BUILD_DIR)/rethinkdb $(PY_PKG_DIR)/rethinkdb
	cd $(PY_PKG_DIR) && python setup.py bdist_egg

publish: sdist
	cd $(PY_PKG_DIR) && python setup.py register sdist upload

install: sdist
	cd $(PY_PKG_DIR) && python setup.py install

.PHONY: all clean publish sdist install
