# JavaScript Driver

This package provides first party support for driving a RethinkDB database from a JavaScript application.
It is designed to be run in node.js but also has an alternate http connection type that is used by the RethinkDB web ui.
The http connection type is not intended to be used by applications, since it isn't secure.
Ultimately, the http connection type will move into the web ui code and out of the driver.

Check out [rethinkdb.com/api/javascript][] for documentation and examples of using this driver.

[rethinkdb.com/api/javascript]: http://www.rethinkdb.com/api/javascript

## Helpful instructions

To build the JavaScript driver, you'll need to first generate the definitions file `proto-def.coffee
