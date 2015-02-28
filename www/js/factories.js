'use strict';

var pfAppF = angular.module('app.factories', []);
pfAppF.factory('AppReady', function ($q, $rootScope,Logger) {
    var q = $q.defer();

    var isCordovaApp = (typeof window.cordova !== "undefined");
    if (navigator.userAgent.match(/(iPhone|iPod|iPad|Android|BlackBerry|IEMobile)/)) {
        //if(isCordovaApp) {
        document.addEventListener("deviceready", onDeviceReady, false);
    } else {
        onDeviceReady();
    }
    function onDeviceReady() {
        Logger.log("AppReady Factory: app is ready");
        $rootScope.$apply(q.resolve());
    }

    return {
        ready: function () {
            return q.promise;
        }
    }
});

pfAppF.factory('DB', function ($q, $cordovaSQLite, $http, Logger,AppReady) {

    var db_;

    function log(msg) {
        Logger.log(msg);
    }

    // private methods
    var openDB_ = function (dbName) {
        log("openDB_ called", dbName);
        var q = $q.defer();
        try {
            if (window.sqlitePlugin !== undefined) {
                db_ = $cordovaSQLite.openDB(dbName + ".db", 1);
                q.resolve(db_);
            } else {
                db_ = window.openDatabase(dbName + ".db", '1', dbName, 200000);
                q.resolve(db_); // browser
            }
        }
        catch (err) {
            q.reject(err);
        }
        return q.promise;
    };

    var createTable_ = function (tableName, schema) {
        log("createTable called");
        var q = $q.defer(),
            query = "CREATE TABLE IF NOT EXISTS " + tableName + " ( " + schema + " )";
        $cordovaSQLite.execute(db_, query).then(function () {
            log("Table created: ", tableName);
            q.resolve(tableName)
        }, function (err) {
            log("Table " + tableName + " could not be created: ", err);
            q.reject(err)
        });

        return q.promise;
    };

    var selectFromTable_ = function (sqlStatement, bindings) {
        var q = $q.defer();

        $cordovaSQLite.execute(db_, sqlStatement, bindings).then(function (res) {
            q.resolve(res);
        }, function (err) {
            log("Select could not be retrieved. ", err);
            q.reject(err);
        });

        return q.promise;
    };

    var insertIntoTable_ = function (sqlStatement, bindings) {
        var q = $q.defer();

        $cordovaSQLite.execute(db_, sqlStatement, bindings).then(function (res) {
            q.resolve(res);
        }, function (err) {
            log("Insert could not be done. ", err);
            q.reject(err);
        });

        return q.promise;
    };

    var initDB = function () {
        log("initDB called");
        var q = $q.defer();
        // successively call private methods, chaining to next with .then()
        openDB_("pwm").then(function (db) {
            // Datenbanken erzeugen
            createTable_("collection_dates", "street_id integer, house_number integer, waste_type text, collection_date date, date_added date, primary key (street_id, house_number, waste_type, collection_date)").then(function () {
                createTable_("streets", "street_id integer primary key, street_name text").then(function () {

                    selectFromTable_("SELECT count(*) as cnt from collection_dates",[]).then(function (res) {
                        Logger.log("Anzahl Einträge: "+res.rows.item(0).cnt);
                    });


                    // Straßendatenbank aufsetzen, wenn sie noch nicht gefüllt ist
                    var query = "SELECT * FROM streets";
                    selectFromTable_(query, []).then(function (res) {
                        if (res.rows.length > 0) {
                            log("Tabelle streets schon gefüllt");
                            q.resolve();
                        } else {
                            log("Tabelle streets noch nicht gefüllt. Mit Daten füllen.");
                            // Aus Datei einlesen und in DB schreiben
                            var streets_json = {};
                            $http.get('streets.json').success(function (data) {
                                streets_json = data;
                                var insert_query = "INSERT INTO streets (street_name) VALUES (?)";
                                for (var o in streets_json) {
                                    $cordovaSQLite.execute(db, insert_query, [streets_json[o].s]);
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
        }, function (err) {
            log(err);
            q.reject(err);
        });
        return q.promise;
    };

    var getStreets = function (street) {
        var query = "SELECT street_name FROM streets WHERE street_name LIKE ? LIMIT 5",
            streetSuggestions = [],
            q = $q.defer();
        selectFromTable_(query, [street + '%']).then(function (res) {
            if (res.rows.length > 0) {
                for (var i = 0; i < res.rows.length; i++) {
                    //log(res.rows.item(i).street_name);
                    streetSuggestions.push(res.rows.item(i).street_name);
                }
                q.resolve(streetSuggestions);
            } else {
                q.reject("no results");
            }
        });

        return q.promise;
    };

    var getDatesForType = function (type, street, hnr) {
        var query = "SELECT collection_date FROM collection_dates WHERE waste_type= ? AND (SELECT street_id FROM streets WHERE street_name= ? ) AND house_number = ? AND collection_date > date('now','localtime') ORDER BY collection_dates.collection_date",
            q = $q.defer(),
            dates = [];
        log("DB.getDatesForType called: " + type);
        selectFromTable_(query, [type, street, hnr]).then(function (res) {
            if (res.rows.length > 0) {
                for (var i = 0; i < res.rows.length; i++) {
                    dates.push(res.rows.item(i).collection_date);
                }
                //log("DB.getDatesForType resolve: " + dates);
                q.resolve(dates);
            } else {
                q.reject();
            }
        });
        return q.promise;

    };

    var isStreetInDB = function (street) {
        // erst schauen, ob Straße genau so in DB ist
        var query = "SELECT street_name FROM streets WHERE street_name = ?",
            q = $q.defer();

        log("isStreetInDB 1: " + street);
        selectFromTable_(query, [street]).then(function (res) {
                if (res.rows.length > 0) {
                    log("DB.isStreetInDB Straße exakt: " + street);
                    q.resolve(street);
                } else {

                    log("isStreetInDB 2: " + street);
                    // wenn nicht, dann schauen, ob genau eine ähnliche Straße in DB ist
                    query = "SELECT street_name FROM streets WHERE street_name LIKE ?";
                    selectFromTable_(query, [street + '%']).then(function (res) {
                        if (res.rows.length == 1) {
                            log("DB.isStreetInDB Straße ähnlich: " + res.rows.item(0).street_name);
                            q.resolve(res.rows.item(0).street_name);
                        } else {
                            q.reject();
                        }
                    });
                }
            },
            function (err) {
                log("Error: ", err);
            });
        return q.promise;
    };

    var loadDatesForCurrentStreet = function (street, number) {
        var query = "SELECT waste_type,strftime('%d.%m.%Y',collection_date) as collection_date FROM collection_dates WHERE street_id=(SELECT street_id FROM streets WHERE street_name= ? ) AND house_number= ? AND collection_date BETWEEN date('now','localtime') AND date('now', '+21 days','localtime') ORDER BY collection_dates.collection_date,1",
            q = $q.defer();
        selectFromTable_(query, [street, number]).then(function (res) {
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
        for (var i = 0; i < dates.length; i++) {
            insertIntoTable_(insert_query, [dates[i].street, dates[i].hnr, dates[i].wtype, dates[i].col_date, dates[i].date_added]).then(function (res) {
                q.resolve(res);
            }, function (err) {
                q.reject(err);
            });
        }

        return q.promise;
    };

    return {
        initDB: initDB,
        getStreets: getStreets,
        loadDatesForCurrentStreet: loadDatesForCurrentStreet,
        putDatesIntoDatabase: putDatesIntoDatabase,
        isStreetInDB: isStreetInDB,
        getDatesForType: getDatesForType
    }
});
pfAppF.factory('GeoLocation', function ($http, $cordovaGeolocation, $q, Logger) {
    return {
        getStreetName: function () {
            Logger.log("GeoLocation.getStreetName()");
            var posOptions = {
                    timeout: 10000,
                    enableHighAccuracy: true
                },
                address = {
                    "street": "",
                    "number": ""
                },
                deferred = $q.defer();

            $cordovaGeolocation
                .getCurrentPosition(posOptions)
                .then(function (position) {
                    var lat = position.coords.latitude,
                        long = position.coords.longitude,
                        url = "https://maps.googleapis.com/maps/api/geocode/json?latlng=" + lat + "," + long + "&language=de&location_type=ROOFTOP&result_type=street_address&key=" + googleGeoLoc_API_Key;

                    Logger.log("getCurrentPosition: " + lat + "," + long);

                    $http.get(url).
                        success(function (data) {
                            Logger.log("GeoLocation.getStreetName Antwort erhalten:" + data);
                            var address_components = data.results[0].address_components;
                            for (var i = 0; i < address_components.length; i++) {
                                if (address_components[i].types[0] == "route") {
                                    address.street = address_components[i].long_name;
                                } else if (address_components[i].types[0] == "street_number") {
                                    address.number = parseInt(address_components[i].long_name);
                                }
                            }
                            deferred.resolve(address);
                        }).
                        error(function (data) {
                            Logger.log("GeoLocation Fehler" + data);
                            deferred.reject("GeoLocation Fehler", data);
                        });
                }, function (err) {
                    // error
                    deferred.reject(err);
                });
            return deferred.promise;
        }
    };
});
pfAppF.factory('LoadingSpinner', function (Logger,AppReady) {
    var spinner_;
    var show = function () {
        //spinnerplugin.show();
        console.log("Spinnerplugin show");
        if(isAvailable()) {
            try {
                spinner_.show();
            }
            catch (err) {
                Logger.log(err);
            }
        }
    };
    var hide = function () {
        if(isAvailable()) {
            spinner_.hide();
        }
    };
    function isAvailable() {
        return (typeof window.spinnerplugin !== "undefined");
    }


    AppReady.ready().then(function () {
            if(isAvailable()) {
                spinner_=window.spinnerplugin;
            }
        }
    );
    return {
        show: show,
        hide: hide
    }
});

pfAppF.factory('Logger', function ($log) {
    var useConsole=true;
    var log = function (msg) {
        if (arguments.length > 1) {
            msg=Array.prototype.slice.call(arguments).join(" ");
        }
        if(useConsole) {
            console.log(msg);
        }
        else {
            $log.log(msg);
        }
    };
    return {
        log:log
    }
});

pfAppF.factory('Notifications', function ($q,Logger, $cordovaLocalNotification,AppReady,$timeout) {

    var hasPermission = function () {
        var q= $q.defer();
        AppReady.ready().then(function () {
            Logger.log("app is ready, checking permissions");
            try {

               window.plugin.notification.local.hasPermission(function (granted) {
                   Logger.log('Permission already has been granted: ' + granted);

                   if(!granted) {
                       window.plugin.notification.local.registerPermission(function (granted) {
                           console.log('Permission has been granted: ' + granted);
                           if(granted) {
                               q.resolve();
                           }
                           else {
                               q.reject();
                           }
                       });
                   }
                   else {
                       q.resolve();
                   }
               });
            }
            catch (err) {
                Logger.log(err);
                q.reject();
            }
        });
        return q.promise;
    };

    var addNotifications = function (dates,idStart,message,title,$scope) {
        hasPermission().then(function () {
            Logger.log(dates);
            var id = idStart;
            for (var i = 0; i < dates.length; i++) {
                Logger.log("adding: ", id);
                var msecPerDay = 24 * 60 * 60 * 1000,
                    date = dates[i] + "T17:00:00",
                    today = new Date(date),
                    yesterday = new Date(today.getTime() - msecPerDay);

                $cordovaLocalNotification.add({
                    id: id,
                    date: yesterday,
                    message: message,
                    title: title
                }, $scope).then(function () {
                    Logger.log('added notification');
                });
                id++;
            }
        },function()   {
            Logger.log("addNotifications has no permission");
        });
        $timeout(function () {
            window.plugin.notification.local.getScheduledIds(function (scheduledIds) {
                Logger.log('Scheduled IDs: ' + scheduledIds.join(' ,'));
            });
        },4000);
    };

    var cancelNotifications = function(idStart, $scope) {
        $cordovaLocalNotification.getScheduledIds($scope).then(function (scheduledIds) {
            for (var i = 0; i < scheduledIds.length; i++) {
                if (scheduledIds[i] >= idStart && scheduledIds[i] < idStart+1000) {
                    $cordovaLocalNotification.cancel(scheduledIds[i]).then(function () {
                        Logger.log('background notification cancelled');
                    });
                }
            }
        });
    };

    var addNotificationForType = function (type,dates,$scope) {
        switch (type) {
            case "Bio":
                addNotifications(dates,1000,"Morgen ist Biomüll.","Biotonne", $scope);
                break;
            case "Gelb":
                addNotifications(dates,2000,"Morgen ist gelbe Tonne.","Gelbe Tonne",$scope);
                break;
            case "Papier":
                addNotifications(dates,3000,"Morgen ist Papiermüll.","Papiermüll",$scope);
                break;
            case "RM":
                addNotifications(dates,4000,"Morgen ist wöchentlicher Restmüll.","Wöchentlicher Restmüll",$scope);
                break;
            case "RM14":
                addNotifications(dates,5000,"Morgen ist 14-tägiger Restmüll.","14-tägiger Restmüll",$scope);
                break;
        }
    };

    var cancelNotificationForType = function (type, $scope) {
        switch (type) {
            case "Bio":
                cancelNotifications(1000, $scope);
                break;
            case "Gelb":
                cancelNotifications(2000, $scope);
                break;
            case "Papier":
                cancelNotifications(3000, $scope);
                break;
            case "RM":
                cancelNotifications(4000, $scope);
                break;
            case "RM14":
                cancelNotifications(5000, $scope);
                break;
        }
    };

    return {
        addNotificationForType: addNotificationForType,
        cancelNotificationForType:cancelNotificationForType
   }
});
