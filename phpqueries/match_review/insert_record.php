<?php
    $uscisname = $_POST["uscisname"];
    $jobboardid = $_POST["jobboardid"];
    $alternatename = $_POST["alternatename"];
    include '../config.inc.php';
    $objDB = new DbConnect();
    $cn = $objDB->conect();
    $query = "CALL InsertNewRecord('$uscisname', '$alternatename', $jobboardid);";
    $rs = $cn->prepare($query);
    $rs->execute();
    $row = $rs->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($rows);
    $cn = null;
?>