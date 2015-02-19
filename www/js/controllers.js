const pwm_url = "http://pfwastemanagementenv-hd7anwmmbc.elasticbeanstalk.com/ServletConnectorServlet";
const googleGeoLoc_API_Key = "AIzaSyDlZDoFEuMLSyEjFZovyj_WwDo-_fTNrmo";

var application = angular.module('app.controllers', [])

.controller("AppCtrl", function AppCtrl($scope, $cordovaSQLite, $http, GeoLocation, DB, $modal, localStorageService) {
    $scope.query = {
        "street": "",
        "hnr": 0
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

    $scope.notifications = 0;
    $scope.pushBio = 1;
    $scope.pushGelb = 1;
    $scope.pushPapier = 1;
    $scope.pushRM = 1;
    $scope.pushRM14 = 1;

    // TODO: zuerst interne DB abfragen, bevor Servlet abgefragt wird
    $scope.getDates = function () {
        $scope.showDates = false;
        var dates = [];
        console.log("Sende Straße und Hausnummer", $scope.query)
        $http.get(pwm_url + '?strasse=' + $scope.query.street + '+&hnr=' + $scope.query.hnr).
        success(function (data, status, headers, config) {
            console.log("Antwort erhalten:", data);


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
                $scope.showDates = true;
                saveStreetChoice();
                loadDatesForCurrentStreet();
            }, function (err) {
                console.log(err);
            });

        }).
        error(function (data, status, headers, config) {
            console.log("Fehler", data);
            $scope.showDates = false;
        });
    };

    $scope.getStreets = function (street) {
        console.log("function getStreets", street);
        $scope.streetSuggestions = [];
        $scope.searchBtn = true;
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
        console.log("function loadDatesForCurrentStreet");
        $scope.dates = [];
        DB.loadDatesForCurrentStreet($scope.query.street, $scope.query.hnr).then(function (res) {
            if (res.rows.length > 0) {
                var loop_last_change_cd;
                var last_index = 0;
                var loop;
                for (var i = 0; i < res.rows.length; i++) {
                    loop = res.rows.item(i);
                    console.log("loop", loop);
                    console.log("loop_before", loop_last_change_cd);
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

                    console.log('{"' + res.rows.item(i).waste_type + '":"' + res.rows.item(i).collection_date + '"}');
                }
            } else {
                console.log("loadDatesForCurrentStreet: no result")
            }
        }, function (err) {
            console.error(err)
        })
    };

    $scope.getStreetFromLocation = function () {
        GeoLocation.getStreetName().then(function (address) {
            if (address.street == "") {
                $scope.showDates = false;
            } else {
                $scope.query.street = address.street;
                $scope.query.hnr = address.number;
                getDates();
            }
        });
    };


    if (localStorageService.get('street') != "" && localStorageService.get('hnr') != "") {
        $scope.query.street = localStorageService.get('street');
        $scope.query.hnr = parseInt(localStorageService.get('hnr'));
        $scope.getDates();
    }

    $scope.updateHnr = function () {
        $scope.searchBtn = true;
    }

    $scope.open = function () {

        var modalInstance = $modal.open({
            templateUrl: 'myModalContent.html',
            controller: 'ModalInstanceCtrl',
            size: 'sm',
            resolve: {}
        });
    };

    $scope.$watch('notifications', function (newValue, oldValue) {
        // Check if value has changes
        if (newValue === oldValue) {
            return;
        }
        // To do: register next push
    }, true);

    $scope.$watch('pushBio', function (newValue, oldValue) {
        // Check if value has changes
        if (newValue === oldValue) {
            return;
        }
        // To do: register next push
    }, true);

    $scope.$watch('pushGelb', function (newValue, oldValue) {
        // Check if value has changes
        if (newValue === oldValue) {
            return;
        }
        // To do: register next push
    }, true);

    $scope.$watch('pushPapier', function (newValue, oldValue) {
        // Check if value has changes
        if (newValue === oldValue) {
            return;
        }
        // To do: register next push
    }, true);

    $scope.$watch('pushRM', function (newValue, oldValue) {
        // Check if value has changes
        if (newValue === oldValue) {
            return;
        }
        // To do: register next push
    }, true);

    $scope.$watch('pushRM14', function (newValue, oldValue) {
        // Check if value has changes
        if (newValue === oldValue) {
            return;
        }
        // To do: register next push
        console.log("changed to: " + newValue);
    }, true);
});


application.controller('ModalInstanceCtrl', function ($scope, $modalInstance) {
    $scope.ok = function () {
        $modalInstance.dismiss('cancel');
    };
});