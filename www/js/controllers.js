/**
 * controller.js
 * Steuert Logik der App. Public Methods werden über die App-GUI index.html aufgerufen. Wird von app.js referenziert.
 * @author Johannes Steier, Jean Frederik Seiter, Vjaceslav Djugai
 */
'use strict';

var pwm_url = "http://pfwastemanagementenv-hd7anwmmbc.elasticbeanstalk.com/ServletConnectorServlet"; // Link zum Middleware-Servlet
var googleGeoLoc_API_Key = "AIzaSyDlZDoFEuMLSyEjFZovyj_WwDo-_fTNrmo"; // Google API Key für Reverse Geolocation

var application; // Angular Controller
application = angular.module('app.controllers', [])

    .controller("AppCtrl", function AppCtrl($rootScope, $scope, $http, GeoLocation, DB, LoadingSpinner, localStorageService, $q, Logger, $timeout, Notifications, InitValueLoader, $window, Toast) {
        // Objekt, um eingegebene Straße und Hausnr. zu speichern.
        $scope.query = {
            "street": "",
            "hnr": ""
        };
        // Objekt, um die Abfuhrtermine der jeweiligen Abfall-Art in Arrays für die Laufzeit zu speichern.
        $scope.dates = {
            "RM": [],
            "RM14": [],
            "Bio": [],
            "Papier": [],
            "Gelb": []
        };
        $scope.showDates = false; // Steuervariable für die Anzeige der Abfuhrtermine
        $scope.streetSuggestions = []; // Array für Vorschläge bei Eingabe einer Straße
        $scope.searchBtn = false; // Steuervariable für die Anzeige des "Suchen" Buttons

        $scope.popupHeight = {height: $window.innerHeight - 130 + "px"}; // Body Height der PopUps
        $scope.faqs = []; // Array für die FAQ

        /*
        Variablen/Einstellungen, die in der App gespeichert und beim Starten geladen werden.
         */
        $scope.notifications = InitValueLoader.load("notifications");
        $scope.pushBio = InitValueLoader.load("Bio");
        $scope.pushGelb = InitValueLoader.load("Gelb");
        $scope.pushPapier = InitValueLoader.load("Papier");
        $scope.pushRM = InitValueLoader.load("RM");
        $scope.pushRM14 = InitValueLoader.load("RM14");

        /*
        Private Methods
         */
        /**
         * Logt msg über die Logger-Factory.
         * @param msg
         */
        function log(msg) {
            Logger.log(msg);
        }

        /**
         * Speichert die eingegebene Straße im lokalen Speicher des Geräts.
         */
        function saveStreetChoice() {
            log("function saveStreetChoice");
            localStorageService.set('street', $scope.query.street);
            localStorageService.set('hnr', $scope.query.hnr);
        }

        /**
         * Lädt die Abfuhrtermine für die aktuell gespeicherte Straße aus der internen Datenbank.
         */
        function loadDatesForCurrentStreet() {
            LoadingSpinner.show();
            log("function loadDatesForCurrentStreet");
            $scope.dates = [];
            // Abfuhrtermine aus interner Datenbank laden
            DB.loadDatesForCurrentStreet($scope.query.street, $scope.query.hnr).then(function (res) {
                log("DB.loadDatesForCurrentStreet result length: " + res.rows.length);
                if (res.rows.length > 0) {
                    var loop_last_change_cd = "",
                        last_index = 0,
                        loop;
                    // Die Abfall-Arten werden pro Abfuhrtermin gesammelt -> in einen mehrdimensionalen Array gepackt
                    for (var i = 0; i < res.rows.length; i++) {
                        loop = res.rows.item(i);
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
                } else { // keine Abfuhrtermine gefunden
                    $scope.showDates = false;
                    log("loadDatesForCurrentStreet: no result");
                    if (Toast.isAvailable()) {
                        Toast.show("Es konnten keine Daten zur angegebenen Adresse gefunden werden");
                    }
                }
                LoadingSpinner.hide();
            }, function (err) {
                log(err);
                LoadingSpinner.hide();
            })
        }

        /**
         * Sucht address.street rekursiv in der internen Datenbank.
         * Wird verwendet, um die Problematik mit "Straße", "Strasse" und "Str." zu lösen.
         * @param address
         * @param count
         * @returns {fd.g.promise|*}
         */
        function searchForStreetName(address, count) {
            log("searchForStreetName", address, count);
            count = count || 0;
            var street = address.street,
                def = $q.defer();
            // Datenbankabfrage, ob Straße in Straßen-Tabelle ist
            DB.isStreetInDB(street).then(function (res_street) {
                def.resolve({street: res_street, number: address.number});
            }, function () {
                // Wenn nicht, das letzte Zeichen entfernen und erneut suchen.
                if (count < 4) { // Maximal 4 Durchgänge
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

        /**
         * Gibt die Abfuhrtermine einer bestimmten Abfall-Art aus der DB zurück.
         * @param type
         * @returns {fd.g.promise|*}
         */
        function getDatesForType(type) {
            log("getDatesForType: " + type);
            var q = $q.defer();
            DB.getDatesForType(type, $scope.query.street, $scope.query.hnr).then(function (res) {
                q.resolve(res);
            });

            return q.promise;
        }

        /**
         * Ruft für die mitgegebene Abfall-Art die Notifications-Factory auf, um Benachrichtigungen hinzuzufügen oder zu löschen.
         * @param active
         * @param type
         */
        function setNotifications(active, type) {
            localStorageService.set(type, active);
            if (active === true) { // Checkbox wurde aktiviert
                getDatesForType(type).then(function (res) {
                    Notifications.addNotificationForType(type, res, $scope);
                });
            } else { // Checkbox wurde deaktiviert
                Notifications.cancelNotificationForType(type, $scope);
            }
        }

        /**
         * Initialisierung des Controllers: Straße und Hausnr. aus Speicher laden und ggf. Abfuhrtermine laden.
         */
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

        /*
        Public Methods
         */



        /**
         * Aufruf der Middleware mit eingegebener Straße und Hausnr., zurückgegebene Termine werden in DB gespeichert.
         */
        $scope.getDates = function () {
            LoadingSpinner.show();

            $scope.notifications = false;
            $scope.showDates = false;

            var dates = [];
            log("getDates Sende Straße und Hausnummer: " + $scope.query.street + " " + $scope.query.hnr);
            // TODO: zuerst interne DB abfragen, bevor Servlet abgefragt wird
            // Middleware-Servlet wird nach Straße und Hausnummr angefragt
            $http.get(pwm_url + '?strasse=' + $scope.query.street + '&hnr=' + $scope.query.hnr).
                success(function (data) {
                    log("getDates Antwort erhalten:", data);

                    // Termine in Datenbank schreiben. Davor das Datum richtig formatieren.
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
                    LoadingSpinner.hide();
                }).
                error(function (data, status, headers, config) {
                    log("getDates Fehler", data);
                    $scope.showDates = false;

                    LoadingSpinner.hide();
                    if (Toast.isAvailable()) {
                        Toast.show("Es konnte keine Verbindung aufgebaut werden,\nstellen sie eine Internetverbindung her");
                    }
                });
        };

        /**
         * Sucht eingegebene Straße in DB, um Vorschläge anzuzeigen.
         * @param street
         * @param hnr
         */
        $scope.getStreets = function (street, hnr) {
            log("function getStreets: " + street);
            $scope.updateSearchBtn();
            $scope.streetSuggestions = [];

            if (street.length > 0) { // Wurden Straßen, die mit den eingegebenen Zeichen anfangen, gefunden, die Vorschläge anzeigen.
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

        /**
         * Abfrage des Standorts über GeoLocation-Factory.
         */
        $scope.getStreetFromLocation = function () {
            log("getStreetFromLocation");
            LoadingSpinner.show();

            // Straßenname und Hausnr. zur aktuellen Position ermitteln
            GeoLocation.getStreetName().then(function (address) {
                    if (address.street == "") {
                        $scope.showDates = false;
                        LoadingSpinner.hide();
                    } else {

                        // Schauen, ob Straße in DB (also in Pforzheim) ist und ggf. Abfuhrtermine abfragen.
                        searchForStreetName(address).then(function (result) {
                            $scope.query.street = result.street;
                            $scope.query.hnr = result.number;
                            LoadingSpinner.hide();
                            $scope.getDates();
                        }, function (err) {
                            log(err);
                            // TODO: wenn Straße nicht in DB ist, Error anzeigen
                            log("getStreetFromLocation: Straße nicht in PF gefunden: " + address.street);
                            LoadingSpinner.hide();
                            if (Toast.isAvailable()) {
                                Toast.show("Es konnten keine Daten zur angegebenen Adresse gefunden werden");
                            }
                        })

                    }
                },
                function (err) {
                    $scope.showDates = false;
                    LoadingSpinner.hide();
                    if (Toast.isAvailable()) {
                        Toast.show("Es konnte kein GPS Signal gefunden werden\nMöglicherweise ist ihr GPS oder Internetverbindung deaktiviert");
                    }
                });
        };

        /**
         * Einstellen der Sichtbarkeit des Suchen-Buttons.
         */
        $scope.updateSearchBtn = function () {
            // Suchen-Button wird nur angezeigt, wenn Straße und Hausnummer eingegeben wurden
            $scope.searchBtn = ($scope.query.street != "" && $scope.query.hnr > 0);
        };

        /**
         * Straße speichern und Vorschläge ausblenden. Wird aufgerufen, wenn Straße aus den Vorschlägen ausgewählt wurde.
         * @param street
         */
        $scope.selectStreet = function (street) {
            $scope.query.street = street;
            $scope.showSuggestions = false;
        };


        /**
         * Überwachung des Push-Notification Reglers.
         */
        $scope.$watch('notifications', function (newValue, oldValue) {
            // Check if value has changes
            if (newValue === oldValue) {
                return;
            }

            Notifications.hasPermission().then(function () {
                // Alle Notifications-Checkboxes an- bzw. abschalten
                localStorageService.set("notifications", newValue);
                if (newValue === true) {
                    if (Toast.isAvailable()) {
                        Toast.show("Sie werden einen Tag vor der Leerung erinnert");
                    }
                    $scope.pushBio = true;
                    $scope.pushGelb = true;
                    $scope.pushPapier = true;
                    $scope.pushRM = true;
                    $scope.pushRM14 = true;
                } else {
                    if(!LoadingSpinner.isActive()) {
                        Toast.show("Sie werden nicht mehr erinnert");
                    }
                    $scope.pushBio = false;
                    $scope.pushGelb = false;
                    $scope.pushPapier = false;
                    $scope.pushRM = false;
                    $scope.pushRM14 = false;
                }
            },function() {
                Logger.log("addNotifications has no permission");
            });
        }, true);

        /**
         * Überwachung des Reglers für Notifications bei Biotonne.
         */
        $scope.$watch('pushBio', function (newValue, oldValue) {
            // Check if value has changes and set notifications
            if (newValue !== oldValue) {
                setNotifications(newValue, "Bio");
            }
        }, true);

        /**
         * Überwachung des Reglers für Notifications bei Gelber Sack.
         */
        $scope.$watch('pushGelb', function (newValue, oldValue) {
            // Check if value has changes and set notifications
            if (newValue !== oldValue) {
                setNotifications(newValue, "Gelb");
            }
        }, true);

        /**
         * Überwachung des Reglers für Notifications bei Papiertonne.
         */
        $scope.$watch('pushPapier', function (newValue, oldValue) {
            // Check if value has changes and set notifications
            if (newValue !== oldValue) {
                setNotifications(newValue, "Papier");
            }
        }, true);

        /**
         * Überwachung des Reglers für Notifications bei 7-tägigem Restmüll.
         */
        $scope.$watch('pushRM', function (newValue, oldValue) {
            // Check if value has changes and set notifications
            if (newValue !== oldValue) {
                setNotifications(newValue, "RM");
            }
        }, true);

        /**
         * Überwachung des Reglers für Notifications bei 14-tägigem Restmüll.
         */
        $scope.$watch('pushRM14', function (newValue, oldValue) {
            // Check if value has changes and set notifications
            if (newValue !== oldValue) {
                setNotifications(newValue, "RM14");
            }
        }, true);

        /**
         * Wenn Datenbank bereit ist, Controller initialisieren.
         */
        $rootScope.dbReady.then(function () {
            log("AppCtrl dbReady fired");
            initController();
        });
    });

