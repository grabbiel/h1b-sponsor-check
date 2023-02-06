<?php
    $companyname = $_POST["companyname"];
    include '../config.inc.php';
    $objDB = new DbConnect();
    $cn = $objDB->conect();
    $query = "SELECT company
    FROM h1b_records WHERE
    company LIKE '$companyname%' OR
    company LIKE '$companyname %' OR
    company LIKE '% $companyname%' OR
    company LIKE '$companyname';";
    $rs = $cn->prepare($query);
    $rs->execute();
    $row = $rs->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($rows);
    $cn = null;
?>