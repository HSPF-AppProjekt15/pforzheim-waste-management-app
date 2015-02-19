angular.module('app.factories',[] )
.factory('DB', function($q, $cordovaSQLite,$http) {

        var db_;

        // private methods
        var openDB_ = function(dbName){

            var q = $q.defer();
            /*if (window.cordova) {
                db_ = $cordovaSQLite.openDB({ name: dbName+".db" }).then(function() {q.resolve(db_)},function(err) {q.reject(err)}); //device
            }else{*/
                db_ = window.openDatabase(dbName+".db", '1', dbName, 1024 * 1024 * 100);
                q.resolve(db_); // browser
            //}
            return q.promise;
        };

        var createTable_ = function(tableName, schema) {
            console.log("createTable called");
            var q = $q.defer(),
                query="CREATE TABLE IF NOT EXISTS "+tableName+" ( "+schema+" )";
            $cordovaSQLite.execute(db_, query).then(function() {
                console.log("Table created: ",tableName);
                q.resolve(tableName)
            },function(err) {
                console.log("Table "+ tableName+ " could not be created: ", err);
                q.reject(err)});

            return q.promise;
        };

        var selectFromTable_ = function (sqlStatement,bindings) {
            var q = $q.defer();

            $cordovaSQLite.execute(db_, sqlStatement, bindings).then(function(res) {
                q.resolve(res);
            },function(err) {
                console.log("Select could not be retrieved. ", err);
                q.reject(err);
            });

            return q.promise;
        };

        var insertIntoTable_ = function (sqlStatement,bindings) {
            var q = $q.defer();

            $cordovaSQLite.execute(db_, sqlStatement, bindings).then(function(res) {
                q.resolve(res);
            },function(err) {
                console.log("Insert could not be done. ", err);
                q.reject(err);
            });

            return q.promise;
        };

        var initDB = function(){
            console.log("initDB called");
            var q = $q.defer();
            // successively call private methods, chaining to next with .then()
            openDB_("pwm").then(function(db){
                // Datenbanken erzeugen
                createTable_("collection_dates","street_id integer, house_number integer, waste_type text, collection_date date, date_added date, primary key (street_id, house_number, waste_type, collection_date)").then(function () {
                    createTable_("streets","street_id integer primary key, street_name text").then(function() {

                        // Straßendatenbank aufsetzen, wenn sie noch nicht gefüllt ist
                        var query = "SELECT * FROM streets";
                        selectFromTable_(query,[]).then(function(res) {
                            if (res.rows.length > 0) {
                                console.log("Tabelle streets schon gefüllt");
                            } else {
                                console.log("Tabelle streets noch nicht gefüllt. Mit Daten füllen.");
                                // Aus Datei einlesen und in DB schreiben
                                var streets_json={};
                                $http.get('streets.json').success (function(data) {
                                    streets_json = data;
                                    var insert_query = "INSERT INTO streets (street_name) VALUES (?)";
                                    for ( o in streets_json) {
                                        $cordovaSQLite.execute(db, insert_query,[streets_json[o].s]);
                                    }
                                    q.resolve();
                                });

                            }
                        }, function (err) {
                            console.error(err);
                            q.reject(err);
                        });
                    });
                });
            });
            return q.promise;
        };

        var getStreets = function(street){
            var query = "SELECT street_name FROM streets WHERE street_name LIKE ? LIMIT 5",
                streetSuggestions= [],
                q = $q.defer();
            selectFromTable_(query, [street + '%']).then(function (res) {
                if (res.rows.length > 0) {
                    for (var i = 0; i < res.rows.length; i++) {
                        //console.log(res.rows.item(i).street_name);
                        streetSuggestions.push(res.rows.item(i).street_name);
                    }
                    q.resolve(streetSuggestions);
                } else {
                    q.reject("no results");
                }
            });

            return q.promise;
        }

        var loadDatesForCurrentStreet = function (street,number) {
            var query= "SELECT waste_type,strftime('%d.%m.%Y',collection_date) as collection_date FROM collection_dates WHERE street_id=(SELECT street_id FROM streets WHERE street_name= ? ) AND house_number= ? AND collection_date BETWEEN date('now','localtime') AND date('now', '+21 days','localtime') ORDER BY collection_dates.collection_date,1",
                q = $q.defer();
            selectFromTable_(query, [street,number]).then(function (res) {
                q.resolve(res);
            }, function (err) {
                q.reject(err);
            });
            return q.promise;
        };

        // TODO: alte Einträge wieder löschen
        var putDatesIntoDatabase = function (dates) {
            var insert_query = "INSERT OR REPLACE INTO collection_dates (street_id, house_number, waste_type, collection_date, date_added) VALUES ((SELECT street_id FROM streets WHERE street_name = ?), ?, ?, ?, ?)",
                q = $q.defer();
            for(var i= 0;i<dates.length;i++) {
                insertIntoTable_(insert_query, [dates[i].street,dates[i].hnr,dates[i].wtype,dates[i].col_date,dates[i].date_added]).then(function (res) {
                    q.resolve(res);
                }, function (err) {
                    q.reject(err);
                });
            }

            return q.promise;
        }

        return {
            initDB: initDB,
            getStreets: getStreets,
            loadDatesForCurrentStreet: loadDatesForCurrentStreet,
            putDatesIntoDatabase: putDatesIntoDatabase
        }
    })
    .factory('GeoLocation', function ($http, $cordovaGeolocation,$q) {
        return {
            getStreetName: function() {
                var posOptions = {timeout: 10000, enableHighAccuracy: true},
                    address = {"street":"","number":""},
                    deferred = $q.defer();

                $cordovaGeolocation
                    .getCurrentPosition(posOptions)
                    .then(function (position) {
                        var lat = position.coords.latitude,
                            long = position.coords.longitude,
                            url = "https://maps.googleapis.com/maps/api/geocode/json?latlng=" + lat + "," + long + "&language=de&location_type=ROOFTOP&result_type=street_address&key=" + googleGeoLoc_API_Key;

                        $http.get(url).
                            success(function (data, status, headers, config) {
                                console.log("Antwort erhalten:", data);
                                var address_components = data.results[0].address_components;
                                for (var i = 0; i < address_components.length; i++) {
                                    if (address_components[i].types[0] == "route") {
                                        address.street = address_components[i].long_name;
                                    }
                                    else if (address_components[i].types[0] == "street_number") {
                                        address.number = parseInt(address_components[i].long_name);
                                    }
                                }
                                deferred.resolve(address);
                            }).
                            error(function (data, status, headers, config) {
                                console.log("Fehler", data);
                                deferred.reject("Fehler",data);
                            });
                    }, function (err) {
                        // error
                        deferred.reject(err);
                    });
                return deferred.promise;
            }
        };
    });;


