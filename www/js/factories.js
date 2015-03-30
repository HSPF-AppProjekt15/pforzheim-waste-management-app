/**
 * factories.js
 * Stellt Factories (Services) zur Verfügung, die Zugriff auf die Plug-Ins übernehmen.
 * @author Johannes Steier, Jean Frederik Seiter
 */

'use strict';

var pfAppF = angular.module('app.factories', []);
/**
 * AppReady: Event Listener für deviceready Event. Wird aufgerufen, wenn PhoneGap initialisiert wurde.
 */
pfAppF.factory('AppReady', function ($q, $rootScope,Logger) {
    var q = $q.defer();

    var isCordovaApp = (typeof window.cordova !== "undefined");
    if (navigator.userAgent.match(/(iPhone|iPod|iPad|Android|BlackBerry|IEMobile)/)) {
        //if(isCordovaApp) {
        document.addEventListener("deviceready", onDeviceReady, false); // deviceready wird von PhoneGap/Cordova getriggered
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

/**
 * DB: Zugriffe auf die Datenbank und Funktionen, die DB-Abfragen regeln.
 */
pfAppF.factory('DB', function ($q, $cordovaSQLite, $http, Logger,AppReady,$timeout) {

    var db_;

    function log(msg) {
        Logger.log(msg);
    }

    /*
    Private Methods
     */
    /**
     * Datenbankverbindung aufbauen bzw. Datenbank anlegen, falls sie noch nicht existiert.
     * @param dbName
     * @returns {fd.g.promise|*}
     * @private
     */
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

    /**
     * Tabelle tableName mit Feldern schema anlegen.
     * @param tableName
     * @param schema
     * @returns {fd.g.promise|*}
     * @private
     */
    var createTable_ = function (tableName, schema) {
        log("createTable called");
        var q = $q.defer(),
            query = "CREATE TABLE IF NOT EXISTS " + tableName + " ( " + schema + " )";
        $cordovaSQLite.execute(db_, query).then(function () {
            log("Table created: "+ tableName);
            q.resolve(tableName)
        }, function (err) {
            log("Table " + tableName + " could not be created: ", err);
            q.reject(err)
        });

        return q.promise;
    };

    /**
     * Select-Abfrage ausführen. Gibt Ergebnis der Abfrage zurück.
     * @param sqlStatement
     * @param bindings
     * @returns {fd.g.promise|*}
     * @private
     */
    var selectFromTable_ = function (sqlStatement, bindings) {
        var q = $q.defer();
        log("selectFromTable_: "+sqlStatement + "; "+ bindings.join());
        $cordovaSQLite.execute(db_, sqlStatement, bindings).then(function (res) {
            log("selectFromTable_: erfolgreich");
            q.resolve(res);
        }, function (err) {
            log("Select could not be retrieved. ", err);
            q.reject(err);
        });

        return q.promise;
    };

    /**
     * Insert-Abfrage ausführen. Gibt Ergebnis der Abfrage zurück.
     * @param sqlStatement
     * @param bindings
     * @returns {fd.g.promise|*}
     * @private
     */
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

    /*
    Public Methods
     */

    /**
     * Initialisiert Datenbank.
     * @returns {fd.g.promise|*}
     */
    var initDB = function () {
        log("initDB called");
        var q = $q.defer();
        // successively call private methods, chaining to next with .then()
        openDB_("pwm").then(function () {
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
                            $http.get('streets.txt').success(function (data) {
                                var streets_array = data.split('\n');
                                log("streets_array: " +streets_array);

                                var insert_query = "INSERT INTO streets (street_name) VALUES (?)";

                                $cordovaSQLite.insertCollection(db_,insert_query,streets_array).then(function () {
                                    $timeout(function () {
                                        query = "SELECT count(*) as cnt FROM streets";

                                    selectFromTable_(query, []).then(function (res) {
                                        Logger.log("Anzahl Einträge in streets: " + res.rows.item(0).cnt);
                                    });
                                    q.resolve();},3000);
                                });
                                /*for (var o in streets_json) {
                                    insertIntoTable_(insert_query, [streets_json[o].s]);
                                }*/
                                /*$timeout(function () {
                                    query = "SELECT count(*) as cnt FROM streets";
                                    selectFromTable_(query, []).then(function (res) {
                                        Logger.log("Anzahl Einträge in streets: " + res.rows.item(0).cnt);
                                    });
                                },3000);
                                q.resolve();*/
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

    /**
     * Suche der übergebenen Straße in der DB und Rückgabe der Vorschläge.
     * @param street
     * @returns {fd.g.promise|*}
     */
    var getStreets = function (street) {
        log("DB.getStreets(): " + street);
        var query = "SELECT street_name FROM streets WHERE street_name LIKE ? LIMIT 5",
            streetSuggestions = [],
            q = $q.defer();
        selectFromTable_(query, [street + '%']).then(function (res) {
            log("DB.getStreets() selectFromTable_ erfolgreich. Anzahl: " + res.rows.length);
            if (res.rows.length > 0) {
                for (var i = 0; i < res.rows.length; i++) {
                    log(res.rows.item(i).street_name);
                    streetSuggestions.push(res.rows.item(i).street_name);
                }
                q.resolve(streetSuggestions);
            } else {
                q.reject("no results");
            }
        });

        return q.promise;
    };

    /**
     * Gibt Abfuhrtermine für Abfallart und Straße+Hausnr. zurück.
     * @param type
     * @param street
     * @param hnr
     * @returns {fd.g.promise|*}
     */
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

    /**
     * Gibt Straßennamen zurück, wenn er in der DB gefunden wurde. Wird benutzt, um Problematik mit "Straße" und "Str." zu lösen.
     * @param street
     * @returns {fd.g.promise|*}
     */
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

    /**
     * Gibt Abfuhrtermine für Straße und Hausnr. zurück.
     * @param street
     * @param number
     * @returns {fd.g.promise|*}
     */
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

    /**
     * Schreibt Abfuhrtermine in die DB.
     * @param dates
     * @returns {fd.g.promise|*}
     */
    var putDatesIntoDatabase = function (dates) {
        // TODO: alte Einträge wieder löschen
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

/**
 * GeoLocation: Gibt Standort des Geräts zurück.
 */
pfAppF.factory('GeoLocation', function ($http, $cordovaGeolocation, $q, Logger) {
    /*
    Public Methods
     */
    return {
        /**
         * Gibt Straßenname und Hausnr. für aktuelle Position des Geräts zurück.
         * @returns {fd.g.promise|*}
         */
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
                .getCurrentPosition(posOptions) // GPS Koordinaten ermitteln
                .then(function (position) {
                    var lat = position.coords.latitude,
                        long = position.coords.longitude,
                        url = "https://maps.googleapis.com/maps/api/geocode/json?latlng=" + lat + "," + long + "&language=de&location_type=ROOFTOP&result_type=street_address&key=" + googleGeoLoc_API_Key;

                    Logger.log("getCurrentPosition: " + lat + "," + long);

                    // Über Google Maps API Reverse Lookup ausführen: aus Koordinaten wird die Straße und Hausnr. ermittelt.
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

/**
 * LoadingSpinner: Übernimmt Anzeige der Ladeanimation.
 */
pfAppF.factory('LoadingSpinner', function (Logger,AppReady, $timeout, $cordovaSpinnerDialog) {
    var spinner_,
        _isActive = false;

    /*
    Public Methods
     */
    /**
     * Ladeanimation anzeigen.
     */
    var show = function () {
        //spinnerplugin.show();
        console.log("Spinnerplugin show");
        if(isAvailable()) {
            try {
                $cordovaSpinnerDialog.show(null, null, true);
                // falls ein Fehler aufgetreten ist und der Lade-Spinner nicht mehr gestoppt wird, nach 10s automatisch stoppen.
                $timeout(function () {
                    if(isActive()) {
                        hide();
                    }
                },10000);
                _isActive = true;
            }
            catch (err) {
                Logger.log(err);
            }
        }
    };
    /**
     * Ladeanimation ausblenden.
     */
    var hide = function () {
        if(isAvailable()) {
            $cordovaSpinnerDialog.hide();
            _isActive = false;
        }
    };

    /**
     * Gibt zurück, ob Ladeanimation angezeigt oder ausgeblendet ist.
     * @returns {boolean}
     */
    var isActive = function() {
        return _isActive;
    };

    /**
     * Überprüft, ob Ladeanimation-Plugin zur Verfügung steht.
     * @returns {boolean}
     */
    function isAvailable() {
        if(!window.plugins) {
            return false;
        }
        return (typeof window.plugins.spinnerDialog !== "undefined");
    }

/*    AppReady.ready().then(function () {
            if(isAvailable()) {
                spinner_=window.plugins.spinnerDialog;
            }
        }
    );*/
    return {
        show: show,
        hide: hide,
        isActive: isActive,
        isAvailable: isAvailable
    }
});

/**
 * Logger: Logging in der Console.
 */
pfAppF.factory('Logger', function ($log) {
    var useConsole=true,
        count=0;
    /*
    Public Methods
     */
    /**
     * Loggt msg.
     * @param msg
     */
    var log = function (msg) {
        msg=count+': '+msg;
        count++;

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

/**
 * Notifications: Speichert, löscht Benachrichtigungen und prüft Zugriff auf Notification-Service.
 */
pfAppF.factory('Notifications', function ($q,Logger, $cordovaLocalNotification,AppReady,$timeout) {

/*
Private Methods
 */

    /**
     * Fügt eine Notification hinzu.
     * @param dates
     * @param idStart
     * @param message
     * @param title
     * @param $scope
     */
    var addNotifications = function (dates,idStart,message,title,$scope) {
            Logger.log(dates);
            var id = idStart;
            var notifications = [];
            for (var i = 0; i < dates.length; i++) {
                Logger.log("adding: ", id);
                var msecPerDay = 24 * 60 * 60 * 1000,
                    date = dates[i] + "T17:00:00",// 17:00 Uhr GMT
                    today = new Date(date),
                    yesterday = new Date(today.getTime() - msecPerDay); // Erinnerung am Vortag

                notifications.push({
                    id: id,
                    at: yesterday,
                    text: message,
                    title: title});
                id++;
            }
                $cordovaLocalNotification.add(notifications, $scope).then(function () {
                    Logger.log('added notifications for '+title);
                });
        
    };

    /**
     * Löscht eine Notification.
     * @param idStart
     * @param $scope
     */
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

    /*
    Public Methods
     */
    /**
     * Erfolgreich, wenn Notifications eingetragen werden können. Hauptsächlich für iOS relevant.
     * @returns {fd.g.promise|*}
     */
    var hasPermission = function () {
        var q= $q.defer();
        AppReady.ready().then(function () {
            Logger.log("app is ready, checking permissions");
            try {

                $cordovaLocalNotification.hasPermission().then(function () {
                    Logger.log('Permission already has been granted.');
                    q.resolve();
                }, function() {
                    $cordovaLocalNotification.registerPermission().then(function () {
                        Logger.log('Permission has been granted after prompt.');
                        q.resolve();
                    }, function () {
                        Logger.log('Permission has not been granted after prompt.');
                        q.reject();
                    });
                });
            }
            catch (err) {
                Logger.log(err);
                q.reject();
            }
        });
        return q.promise;
    };

    /**
     * Fügt Notifications für eine Abfallart hinzu.
     * @param type
     * @param dates
     * @param $scope
     */
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

    /**
     * Löscht Notifications einer Abfallart.
     * @param type
     * @param $scope
     */
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
        cancelNotificationForType:cancelNotificationForType,
        hasPermission:hasPermission
   }
});

/**
 * InitValueLoad: Lädt Variable/Einstellung aus lokalem Speicher.
 */
pfAppF.factory('InitValueLoader', function (localStorageService) {
    /*
    Private Methods
     */
    /**
     * Wandelt den String in Boolean um.
     * @param string
     * @returns {boolean}
     */
    var stringToBoolean = function (string) {
        switch (string) {
            case "true":
                return true;
            case "false":
                return false;
            default:
                return false;
        }
    };

    /*
    Public Methods
     */
    /**
     * Gibt Variable/Einstellung aus lokalem Speicher zurück.
     * @param type
     * @returns {boolean}
     */
    var load = function(type) {
        var value = localStorageService.get(type);
        return stringToBoolean(value);
    };

    return {
        load: load
    }
});

/**
 * Toast: Zeigt Popup-Benachrichtigungen an.
 */
pfAppF.factory('Toast', function ($cordovaToast) {
    /*
    Public Methods
     */
    /**
     * msg als Popup anzeigen.
     * @param msg
     */
    var show = function (msg) {
        $cordovaToast.showLongTop(msg);
    };

    /**
     * True, wenn Toast-Plugin zur Verfügung steht.
     * @returns {boolean}
     */
    var isAvailable = function () {
        if(!window.plugins) {
            return false;
        }
        return (typeof window.plugins.toast !== "undefined");
    };

    return {
        show: show,
        isAvailable: isAvailable
    }
});

