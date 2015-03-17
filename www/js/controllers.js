'use strict';

var pwm_url = "http://pfwastemanagementenv-hd7anwmmbc.elasticbeanstalk.com/ServletConnectorServlet";
var googleGeoLoc_API_Key = "AIzaSyDlZDoFEuMLSyEjFZovyj_WwDo-_fTNrmo";

var application;
application = angular.module('app.controllers', [])

    .controller("AppCtrl", function AppCtrl($rootScope, $scope, $http, GeoLocation, DB, LoadingSpinner, localStorageService, $q, Logger, $timeout, Notifications, InitValueLoader, $window) {
        $scope.query = {
            "street": "",
            "hnr": ""
        };
        $scope.dates = {
            "RM": [],
            "RM14": [],
            "Bio": [],
            "Papier": [],
            "Gelb": []
        };
        $scope.showDates = false;
        $scope.streetSuggestions = [];
        $scope.searchBtn = false;

        $scope.popupHeight = $window.innerHeight - 130 + "px"; // Body Height des FAQ
        $scope.faqs = [];

        $scope.notifications = InitValueLoader.load("notifications");
        $scope.pushBio = InitValueLoader.load("Bio");
        $scope.pushGelb = InitValueLoader.load("Gelb");
        $scope.pushPapier = InitValueLoader.load("Papier");
        $scope.pushRM = InitValueLoader.load("RM");
        $scope.pushRM14 = InitValueLoader.load("RM14");

        // Private Methods
        function log(msg) {
            Logger.log(msg);
        }

        function saveStreetChoice() {
            log("function saveStreetChoice");
            localStorageService.set('street', $scope.query.street);
            localStorageService.set('hnr', $scope.query.hnr);
        }

        function loadDatesForCurrentStreet() {
            LoadingSpinner.show();
            log("function loadDatesForCurrentStreet");
            $scope.dates = [];
            DB.loadDatesForCurrentStreet($scope.query.street, $scope.query.hnr).then(function (res) {
                log("DB.loadDatesForCurrentStreet result length: " + res.rows.length);
                if (res.rows.length > 0) {
                    var loop_last_change_cd;
                    var last_index = 0;
                    var loop;
                    for (var i = 0; i < res.rows.length; i++) {
                        loop = res.rows.item(i);
                        //log("loop", loop);
                        //log("loop_before", loop_last_change_cd);
                        if (loop.collection_date == loop_last_change_cd) {
                            // collection_date ist gleich, waste_type wird dem zweiten property des objects dates hinzugefügt
                            $scope.dates[last_index].waste_type.push(loop.waste_type);
                        } else {
                            // neues collection_date
                            $scope.dates.push({
                                "collection_date": loop.collection_date,
                                "waste_type": [loop.waste_type]
                            });
                            last_index = $scope.dates.length - 1;
                            loop_last_change_cd = loop.collection_date;
                        }

                        //log('{"' + res.rows.item(i).waste_type + '":"' + res.rows.item(i).collection_date + '"}');

                    }
                    $scope.showDates = true;
                } else {
                    $scope.showDates = false;
                    log("loadDatesForCurrentStreet: no result");
                    LoadingSpinner.hide();
                    if (window.spinnerplugin) {
                        window.plugins.toast.showLongTop("Es konnten keine Daten zur angegebenen Adresse gefunden werden");
                    }
                }
                LoadingSpinner.hide();
            }, function (err) {
                log(err)
            })
        }

        function searchForStreetName(address, count) {
            log("searchForStreetName", address, count);
            count = count || 0;
            var street = address.street,
                def = $q.defer();
            DB.isStreetInDB(street).then(function (res_street) {
                def.resolve({street: res_street, number: address.number});
            }, function () {
                // Maximal 4 Durchgänge
                if (count < 4) {

                    searchForStreetName({
                        street: street.substring(0, street.length - 1),
                        number: address.number
                    }, ++count).then(function (result) {
                        def.resolve(result);
                    }, function (street) {
                        def.reject(street);
                    });
                } else {
                    def.reject(street);
                }
            });
            return def.promise;
        }

        function getDatesForType(type) {
            log("getDatesForType: " + type);
            var q = $q.defer();
            DB.getDatesForType(type, $scope.query.street, $scope.query.hnr).then(function (res) {
                q.resolve(res);
            });

            return q.promise;
        }

        function setNotifications(active, type) {
            localStorageService.set(type, active);
            if (active === true) {
                getDatesForType(type).then(function (res) {
                    Notifications.addNotificationForType(type, res, $scope);
                });
            } else {
                Notifications.cancelNotificationForType(type, $scope);
            }
        }


        function initController() {
            if (localStorageService.get('street') && localStorageService.get('hnr')) {
                $scope.query.street = localStorageService.get('street');
                $scope.query.hnr = parseInt(localStorageService.get('hnr'));
                loadDatesForCurrentStreet();
            }
            $http.get('faq.json').success(function (data) {
                $scope.faqs = data;
            });
        }

        // Public Methods

        // TODO: zuerst interne DB abfragen, bevor Servlet abgefragt wird
        $scope.getDates = function () {
            LoadingSpinner.show();

            $scope.notifications = false;
            $scope.showDates = false;

            var dates = [];
            log("getDates Sende Straße und Hausnummer: " + $scope.query.street + " " + $scope.query.hnr);
            $http.get(pwm_url + '?strasse=' + $scope.query.street + '&hnr=' + $scope.query.hnr).
                success(function (data) {
                    log("getDates Antwort erhalten:", data);


                    // In Datenbank schreiben
                    angular.forEach(data, function (value, key) {
                        log("key", key);

                        for (var i = 0; i < value.length; i++) {
                            var date = value[i].trim();

                            date = date.substring(0, 10);
                            date = date.substring(6, 10) + '-' + date.substring(3, 5) + '-' + date.substring(0, 2);
                            log(key + ' ' + date);

                            dates.push({
                                "street": $scope.query.street,
                                "hnr": $scope.query.hnr,
                                "wtype": key,
                                "col_date": date,
                                "date_added": new Date()
                            })
                        }
                    });
                    DB.putDatesIntoDatabase(dates).then(function (res) {
                        saveStreetChoice();
                        loadDatesForCurrentStreet();
                    }, function (err) {
                        log(err);
                    });

                }).
                error(function (data, status, headers, config) {
                    log("getDates Fehler", data);
                    $scope.showDates = false;

                    LoadingSpinner.hide();
                    if (window.spinnerplugin) {
                        window.plugins.toast.showLongTop("Es konnte keine Verbindung aufgebaut werden,\nstellen sie eine Internetverbindung her");
                    }
                });
        };


        $scope.getStreets = function (street, hnr) {
            log("function getStreets: " + street);
            $scope.updateSearchBtn();
            $scope.streetSuggestions = [];

            if (street.length > 0) {
                DB.getStreets(street).then(function (streetSuggestions) {
                    log(streetSuggestions);
                    $scope.streetSuggestions = streetSuggestions;
                    $scope.showSuggestions = true;
                }, function (err) {
                    log(err);
                    $scope.showSuggestions = false;
                });

            } else {
                $scope.showSuggestions = false;
            }
        };


        $scope.getStreetFromLocation = function () {

            log("getStreetFromLocation");

            LoadingSpinner.show();

            GeoLocation.getStreetName().then(function (address) {
                    if (address.street == "") {
                        $scope.showDates = false;
                        LoadingSpinner.hide();
                    } else {

                        // Schauen, ob Straße in DB
                        searchForStreetName(address).then(function (result) {
                            $scope.query.street = result.street;
                            $scope.query.hnr = result.number;
                            $scope.getDates();
                        }, function (err) {
                            log(err);
                            // TODO: wenn Straße nicht in DB ist, Error anzeigen
                            log("getStreetFromLocation: Straße nicht in PF gefunden: " + address.street);
                            LoadingSpinner.hide();
                            if (window.spinnerplugin) {
                                window.plugins.toast.showLongTop("Es konnten keine Daten zur angegebenen Adresse gefunden werden");
                            }
                        })

                    }
                },
                function (err) {
                    $scope.showDates = false;
                    LoadingSpinner.hide();
                    if (window.spinnerplugin) {
                        window.plugins.toast.showLongTop("Es konnte kein GPS Signal gefunden werden\nMöglicherweise ist ihr GPS oder Internetverbindung deaktiviert");
                    }
                });
        };


        $scope.updateSearchBtn = function () {
            $scope.searchBtn = ($scope.query.street != "" && $scope.query.hnr > 0);
        };


        $scope.selectStreet = function (street) {
            $scope.query.street = street;
            $scope.showSuggestions = false;
        };

        $scope.$watch('notifications', function (newValue, oldValue) {
            // Check if value has changes
            if (newValue === oldValue) {
                return;
            }
            // To do: register next push
            localStorageService.set("notifications", newValue);
            if (newValue === true) {
				if (window.spinnerplugin) {
					window.plugins.toast.showLongTop("Sie werden einen Tag vor der Leerung erinnert");
				}
                $scope.pushBio = true;
                $scope.pushGelb = true;
                $scope.pushPapier = true;
                $scope.pushRM = true;
                $scope.pushRM14 = true;
            } else {
                if(!LoadingSpinner.isActive()) {
                    window.plugins.toast.showLongTop("Sie werden nicht mehr erinnert");
                }
                $scope.pushBio = false;
                $scope.pushGelb = false;
                $scope.pushPapier = false;
                $scope.pushRM = false;
                $scope.pushRM14 = false;
            }
        }, true);

        $scope.$watch('pushBio', function (newValue, oldValue) {
            // Check if value has changes and set notifications
            if (newValue !== oldValue) {
                setNotifications(newValue, "Bio");
            }
        }, true);

        $scope.$watch('pushGelb', function (newValue, oldValue) {
            // Check if value has changes and set notifications
            if (newValue !== oldValue) {
                setNotifications(newValue, "Gelb");
            }
        }, true);

        $scope.$watch('pushPapier', function (newValue, oldValue) {
            // Check if value has changes and set notifications
            if (newValue !== oldValue) {
                setNotifications(newValue, "Papier");
            }
        }, true);

        $scope.$watch('pushRM', function (newValue, oldValue) {
            // Check if value has changes and set notifications
            if (newValue !== oldValue) {
                setNotifications(newValue, "RM");
            }
        }, true);

        $scope.$watch('pushRM14', function (newValue, oldValue) {
            // Check if value has changes and set notifications
            if (newValue !== oldValue) {
                setNotifications(newValue, "RM14");
            }
        }, true);

        // INIT CONTROLLER
        $rootScope.dbReady.then(function () {
            log("AppCtrl dbReady fired");
            $timeout(function () {
                try {
                    log("spinner:" + JSON.stringify(spinnerplugin));
                }
                catch (e) {
                    log(e);
                }
            }, 5000);

            initController();
        });
    });

