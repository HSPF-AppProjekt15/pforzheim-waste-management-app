const pwm_url = "http://pfwastemanagementenv-hd7anwmmbc.elasticbeanstalk.com/ServletConnectorServlet";
const googleGeoLoc_API_Key = "AIzaSyDlZDoFEuMLSyEjFZovyj_WwDo-_fTNrmo";

var application = angular.module('app.controllers', [])

    .controller("AppCtrl", function AppCtrl($scope, $http, GeoLocation, DB, localStorageService, $q, $cordovaLocalNotification) {
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

        $scope.notifications = typeof localStorageService.get("notifications") !== 'object' ? localStorageService.get("notifications") : false;
        $scope.pushBio = typeof localStorageService.get("Bio") !== 'object' ? localStorageService.get("Bio") : false;
        $scope.pushGelb = typeof localStorageService.get("Gelb") !== 'object' ? localStorageService.get("Gelb") : false;
        $scope.pushPapier = typeof localStorageService.get("Papier") !== 'object' ? localStorageService.get("Papier") : false;
        $scope.pushRM = typeof localStorageService.get("RM") !== 'object' ? localStorageService.get("RM") : false;
        $scope.pushRM14 = typeof localStorageService.get("RM14") !== 'object' ? localStorageService.get("RM14") : false;


        // TODO: zuerst interne DB abfragen, bevor Servlet abgefragt wird
        $scope.getDates = function () {
            if (window.spinnerplugin) {
                spinnerplugin.show();
            }
            $scope.pushBio = false;
            $scope.pushGelb = false;
            $scope.pushPapier = false;
            $scope.pushRM = false;
            $scope.pushRM14 = false;
            $scope.showDates = false;
            var dates = [];
            console.log("getDates Sende Straße und Hausnummer: " + $scope.query.street + " " + $scope.query.hnr);
            $http.get(pwm_url + '?strasse=' + $scope.query.street + '+&hnr=' + $scope.query.hnr).
                success(function (data, status, headers, config) {
                    console.log("getDates Antwort erhalten:", data);


                    // In Datenbank schreiben
                    angular.forEach(data, function (value, key) {
                        console.log("key", key);

                        for (var i = 0; i < value.length; i++) {
                            date = value[i].trim();

                            date = date.substring(0, 10);
                            date = date.substring(6, 10) + '-' + date.substring(3, 5) + '-' + date.substring(0, 2);
                            console.log(key + ' ' + date);

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
                        console.log(err);
                    });

                }).
                error(function (data, status, headers, config) {
                    console.log("getDates Fehler", data);
                    $scope.showDates = false;
                    if (window.spinnerplugin) {
                        spinnerplugin.hide();
                    }
                    if (window.spinnerplugin) {
                        window.plugins.toast.showLongTop("Es konnte keine Verbindung aufgebaut werden,\nstellen sie eine Internetverbindung her");
                    }
                });
        };


        $scope.getStreets = function (street, hnr) {
            console.log("function getStreets: " + street);
            $scope.updateSearchBtn();
            $scope.streetSuggestions = [];

            if (street.length > 0) {
                DB.getStreets(street).then(function (streetSuggestions) {
                    $scope.streetSuggestions = streetSuggestions;
                    $scope.showSuggestions = true;
                }, function (err) {
                    console.log(err);
                    $scope.showSuggestions = false;
                });

            }
        };

        function saveStreetChoice() {
            console.log("function saveStreetChoice");
            localStorageService.set('street', $scope.query.street);
            localStorageService.set('hnr', $scope.query.hnr);
        };

        function loadDatesForCurrentStreet() {
            if (window.spinnerplugin) {
                spinnerplugin.show();
            }
            console.log("function loadDatesForCurrentStreet");
            $scope.dates = [];
            DB.loadDatesForCurrentStreet($scope.query.street, $scope.query.hnr).then(function (res) {
                if (res.rows.length > 0) {
                    var loop_last_change_cd;
                    var last_index = 0;
                    var loop;
                    for (var i = 0; i < res.rows.length; i++) {
                        loop = res.rows.item(i);
                        //console.log("loop", loop);
                        //console.log("loop_before", loop_last_change_cd);
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

                        //console.log('{"' + res.rows.item(i).waste_type + '":"' + res.rows.item(i).collection_date + '"}');

                    }
                    $scope.showDates = true;
                } else {
                    $scope.showDates = false;
                    console.log("loadDatesForCurrentStreet: no result")
                    if (window.spinnerplugin) {
                        window.plugins.toast.showLongTop("Es konnten keine Daten zur angegebenen Adresse gefunden werden");
                    }
                }
                if (window.spinnerplugin) {
                    spinnerplugin.hide();
                }
            }, function (err) {
                console.error(err)
            })
        };

        function searchForStreetName(address, count) {
            console.log("searchForStreetName", address, count);
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
        };


        $scope.getStreetFromLocation = function () {

            console.log("getStreetFromLocation");

            if (window.spinnerplugin) {
                spinnerplugin.show();
            }

            GeoLocation.getStreetName().then(function (address) {
                    if (address.street == "") {
                        $scope.showDates = false;
                        if (window.spinnerplugin) {
                            spinnerplugin.hide();
                        }
                    } else {

                        // Schauen, ob Straße in DB
                        searchForStreetName(address).then(function (result) {
                            $scope.query.street = result.street;
                            $scope.query.hnr = result.number;
                            $scope.getDates();
                        }, function (err) {
                            console.log(err);
                            // TODO: wenn Straße nicht in DB ist, Error anzeigen
                            console.log("getStreetFromLocation: Straße nicht in PF gefunden: " + address.street);
							if (window.spinnerplugin) {
								spinnerplugin.hide();
							}
							if (window.spinnerplugin) {
								window.plugins.toast.showLongTop("Es konnten keine Daten zur angegebenen Adresse gefunden werden");
							}
                        })

                    }
                },
                function (err) {
                    $scope.showDates = false;
                    if (window.spinnerplugin) {
                        spinnerplugin.hide();
                    }
                    if (window.spinnerplugin) {
                        window.plugins.toast.showLongTop("Es konnte kein GPS Signal gefunden werden\nMöglicherweise ist ihr GPS oder Internetverbindung deaktiviert");
                    }
                });
        };

        function getDatesForType(type) {
            console.log("getDatesForType: " + type);
            var q = $q.defer();
            DB.getDatesForType(type, $scope.query.street, $scope.query.hnr).then(function (res) {
                q.resolve(res);
            });

            return q.promise;
        };


        function loadApp() {
            if (localStorageService.get('street') && localStorageService.get('hnr')) {
                $scope.query.street = localStorageService.get('street');
                $scope.query.hnr = parseInt(localStorageService.get('hnr'));
                loadDatesForCurrentStreet();
            }
        };

        if (navigator.userAgent.match(/(iPhone|iPod|iPad|Android|BlackBerry)/)) {
            document.addEventListener("deviceready", function abfrage() {
                loadApp();
            }, false);
        } else {
            loadApp();
        }

        $scope.updateSearchBtn = function () {
            if ($scope.query.street != "" && $scope.query.hnr > 0) {
                $scope.searchBtn = true;
            } else {
                $scope.searchBtn = false;
            }
        };


        /*    $scope.open = function () {
         var modalInstance = $modal.open({
         templateUrl: 'myModalContent.html',
         controller: 'ModalInstanceCtrl',
         size: 'sm',
         resolve: {}
         });
         };*/

        $scope.$watch('notifications', function (newValue, oldValue) {
            // Check if value has changes
            if (newValue === oldValue) {
                return;
            }
            // To do: register next push
            localStorageService.set("notifications", newValue);
            if (newValue === true) {
                $scope.pushBio = true;
                $scope.pushGelb = true;
                $scope.pushPapier = true;
                $scope.pushRM = true;
                $scope.pushRM14 = true;
            } else {
                $scope.pushBio = false;
                $scope.pushGelb = false;
                $scope.pushPapier = false;
                $scope.pushRM = false;
                $scope.pushRM14 = false;
            }
        }, true);

        $scope.$watch('pushBio', function (newValue, oldValue) {
            // Check if value has changes
            if (newValue === oldValue) {
                return;
            }
            // To do: register next push
            localStorageService.set("Bio", newValue);
            if (newValue === true) {
                var dates;
                getDatesForType('Bio').then(function (res) {
                    dates = res;
                    console.log(dates);
                    var bioIds = 1000;
                    for (var i = 0; i < dates.length; i++) {
                        var msecPerDay = 24 * 60 * 60 * 1000,
                            date = dates[i] + "T17:00:00",
                            today = new Date(date),
                            yesterday = new Date(today.getTime() - msecPerDay);

                        $cordovaLocalNotification.add({
                            id: bioIds,
                            date: yesterday,
                            message: 'Morgen ist Biomüll',
                            title: 'Biotonne'
                        }).then(function () {
                            console.log('callback for adding background notification');
                        });
                        bioIds++;
                    }
                });
            } else {
                $cordovaLocalNotification.getScheduledIds().then(function (scheduledIds) {
                    for (var i = 0; i < scheduledIds; i++) {
                        if (scheduledIds[i] >= 1000 && scheduledIds[i] < 2000) {
                            $cordovaLocalNotification.cancel(scheduledIds[i]).then(function () {
                                console.log('callback for cancellation background notification');
                            });
                        }
                    }
                });
            }
        }, true);

        $scope.$watch('pushGelb', function (newValue, oldValue) {
            // Check if value has changes
            if (newValue === oldValue) {
                return;
            }
            // To do: register next push
            localStorageService.set("Gelb", newValue);
            if (newValue === true) {
                var dates;
                getDatesForType('Gelb').then(function (res) {
                    dates = res;
                    console.log(dates);
                    var gelbIds = 2000;
                    for (var i = 0; i < dates.length; i++) {
                        var msecPerDay = 24 * 60 * 60 * 1000,
                            date = dates[i] + "T17:00:00",
                            today = new Date(date),
                            yesterday = new Date(today.getTime() - msecPerDay);

                        $cordovaLocalNotification.add({
                            id: gelbIds,
                            date: yesterday,
                            message: 'Morgen ist Gelbe Tonne',
                            title: 'Gelbe Tonne'
                        }).then(function () {
                            console.log('callback for adding background notification');
                        });
                        gelbIds++;
                    }
                });
            } else {
                $cordovaLocalNotification.getScheduledIds().then(function (scheduledIds) {
                    for (var i = 0; i < scheduledIds; i++) {
                        if (scheduledIds[i] >= 2000 && scheduledIds[i] < 3000) {
                            $cordovaLocalNotification.cancel(scheduledIds[i]).then(function () {
                                console.log('callback for cancellation background notification');
                            });
                        }
                    }
                });
            }
        }, true);

        $scope.$watch('pushPapier', function (newValue, oldValue) {
            // Check if value has changes
            if (newValue === oldValue) {
                return;
            }
            // To do: register next push
            localStorageService.set("Papier", newValue);
            if (newValue === true) {
                var dates;
                getDatesForType('Papier').then(function (res) {
                    dates = res;
                    console.log(dates);
                    var papierIds = 3000;
                    for (var i = 0; i < dates.length; i++) {
                        var msecPerDay = 24 * 60 * 60 * 1000,
                            date = dates[i] + "T17:00:00",
                            today = new Date(date),
                            yesterday = new Date(today.getTime() - msecPerDay);

                        $cordovaLocalNotification.add({
                            id: papierIds,
                            date: yesterday,
                            message: 'Morgen ist Papiermüll',
                            title: 'Papier Tonne'
                        }).then(function () {
                            console.log('callback for adding background notification');
                        });
                        papierIds++;
                    }
                });
            } else {
                $cordovaLocalNotification.getScheduledIds().then(function (scheduledIds) {
                    for (var i = 0; i < scheduledIds; i++) {
                        if (scheduledIds[i] >= 3000 && scheduledIds[i] < 4000) {
                            $cordovaLocalNotification.cancel(scheduledIds[i]).then(function () {
                                console.log('callback for cancellation background notification');
                            });
                        }
                    }
                });
            }
        }, true);

        $scope.$watch('pushRM', function (newValue, oldValue) {
            // Check if value has changes
            if (newValue === oldValue) {
                return;
            }
            // To do: register next push
            localStorageService.set("RM", newValue);
            if (newValue === true) {
                var dates;
                getDatesForType('RM').then(function (res) {
                    dates = res;
                    console.log(dates);
                    var rmIds = 4000;
                    for (var i = 0; i < dates.length; i++) {
                        var msecPerDay = 24 * 60 * 60 * 1000,
                            date = dates[i] + "T17:00:00",
                            today = new Date(date),
                            yesterday = new Date(today.getTime() - msecPerDay);

                        $cordovaLocalNotification.add({
                            id: rmIds,
                            date: yesterday,
                            message: 'Morgen ist 7 tägiger Restmüll',
                            title: 'Restmüll 7 tägig'
                        }).then(function () {
                            console.log('callback for adding background notification');
                        });
                        rmIds++;
                    }
                });
            } else {
                $cordovaLocalNotification.getScheduledIds().then(function (scheduledIds) {
                    console.log(scheduledIds);
                    for (var i = 0; i < scheduledIds; i++) {
                        if (scheduledIds[i] >= 4000 && scheduledIds[i] < 5000) {
                            $cordovaLocalNotification.cancel(scheduledIds[i]).then(function () {
                                console.log('callback for cancellation background notification');
                            });
                        }
                    }
                });
            }
        }, true);

        $scope.$watch('pushRM14', function (newValue, oldValue) {
            // Check if value has changes
            if (newValue === oldValue) {
                return;
            }
            // To do: register next push
            localStorageService.set("RM14", newValue);
            if (newValue === true) {
                var dates;
                getDatesForType('Gelb').then(function (res) {
                    dates = res;
                    console.log(dates);
                    var rm14Ids = 5000;
                    for (var i = 0; i < dates.length; i++) {
                        var msecPerDay = 24 * 60 * 60 * 1000,
                            date = dates[i] + "T17:00:00",
                            today = new Date(date),
                            yesterday = new Date(today.getTime() - msecPerDay);

                        $cordovaLocalNotification.add({
                            id: rm14Ids,
                            date: yesterday,
                            message: 'Morgen ist 14 tägiger Restmüll',
                            title: 'Restmüll 14 tägig'
                        }).then(function () {
                            console.log('callback for adding background notification');
                        });
                        rm14Ids++;
                    }
                });
            } else {
                $cordovaLocalNotification.getScheduledIds().then(function (scheduledIds) {
                    console.log(scheduledIds);
                    for (var i = 0; i < scheduledIds; i++) {
                        if (scheduledIds[i] >= 5000 && scheduledIds[i] < 6000) {
                            $cordovaLocalNotification.cancel(scheduledIds[i]).then(function () {
                                console.log('callback for cancellation background notification');
                            });
                        }
                    }
                });
            }
        }, true);
    });


/*
 application.controller('ModalInstanceCtrl', function ($scope, $modalInstance) {
 $scope.ok = function () {
 $modalInstance.dismiss('cancel');
 };
 });*/
