const pwm_url = "http://pfwastemanagementenv-hd7anwmmbc.elasticbeanstalk.com/ServletConnectorServlet";
const googleGeoLoc_API_Key = "AIzaSyDlZDoFEuMLSyEjFZovyj_WwDo-_fTNrmo";

var application = angular.module('app.controllers', [])

.controller("AppCtrl", function AppCtrl($scope, $http, GeoLocation, DB, $modal, localStorageService,$q) {
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

    $scope.notifications = 0;
    $scope.pushBio = 1;
    $scope.pushGelb = 1;
    $scope.pushPapier = 1;
    $scope.pushRM = 1;
    $scope.pushRM14 = 1;

    // TODO: zuerst interne DB abfragen, bevor Servlet abgefragt wird
    $scope.getDates = function () {
		if(window.spinnerplugin) {
			spinnerplugin.show();
		}
        $scope.showDates = false;
        var dates = [];
        console.log("getDates Sende Straße und Hausnummer: "+ $scope.query.street+" "+$scope.query.hnr);
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
			if(window.spinnerplugin) {
				spinnerplugin.hide();
			}
			if(window.spinnerplugin) {
				window.plugins.toast.showLongTop("Es konnte keine Verbindung aufgebaut werden,\nstellen sie eine Internetverbindung her");
			}
        });
    };


    $scope.getStreets = function (street, hnr) {
        console.log("function getStreets: "+ street);

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
    }

    function loadDatesForCurrentStreet() {
		if(window.spinnerplugin) {
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
				if(window.spinnerplugin) {
					window.plugins.toast.showLongTop("Es konnten keine Daten zur angegebenen Adresse gefunden werden");
				}
            }
			if(window.spinnerplugin) {
				spinnerplugin.hide();
			}
        }, function (err) {
            console.error(err)
        })
    }
        function searchForStreetName(address, count ) {
            console.log("searchForStreetName", address,count);
            count = count || 0;
            var street = address.street,
                def = $q.defer();
            DB.isStreetInDB(street).then(function (res_street) {
                def.resolve({street:res_street,number:address.number});
            }, function () {
                // Maximal 4 Durchgänge
                if(count<4) {

                    searchForStreetName({street: street.substring(0, street.length - 1), number: address.number},++count).then(function (result) {
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


    $scope.getStreetFromLocation = function () {

        console.log("getStreetFromLocation");

        if(window.spinnerplugin) {
            spinnerplugin.show();
        }

        GeoLocation.getStreetName().then(function (address) {
            if (address.street == "") {
                $scope.showDates = false;
				if(window.spinnerplugin) {
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
                    console.log("getStreetFromLocation: Straße nicht in PF gefunden: "+ address.street);
                })

            }
        },
		function (err) {
			$scope.showDates = false;
			if(window.spinnerplugin) {
				spinnerplugin.hide();
			}
			if(window.spinnerplugin) {
				window.plugins.toast.showLongTop("Es konnte kein GPS Signal gefunden werden\nMöglicherweise ist ihr GPS oder Internetverbindung deaktiviert");
			}
		});
    };


	document.addEventListener("deviceready", function abfrage (){
		if (localStorageService.get('street') && localStorageService.get('hnr')) {
			$scope.query.street = localStorageService.get('street');
			$scope.query.hnr = parseInt(localStorageService.get('hnr'));
			loadDatesForCurrentStreet();
		}
	},
	false);

    $scope.updateSearchBtn = function () {
		if($scope.query.street != "" && $scope.query.hnr > 0){
			$scope.searchBtn = true;
		} else {
			$scope.searchBtn = false;
		}
    };


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