<?php
    $companyname = $_POST["companyname"];
    include_once '../config.inc.php';
    $objDB = new DbConnect();
    $cn = $objDB->conect();
    $query = "SELECT ROUND(AVG(summary.requests),0) AS company_requests, ROUND(AVG(summary.approvals),0) AS company_approvals, MIN(summary.ranking) AS company_ranking FROM (SELECT requests, approvals, ranking FROM h1b_records WHERE company LIKE '$companyname%' OR company LIKE '$companyname %' OR company LIKE '% $companyname%' OR company LIKE '$companyname') AS summary;";
    $rs = $cn->prepare($query);
    $rs->execute();
    /* output is always 1(one) object no need to fetch all, just fetch first */
    $rows = $rs->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($rows);
    $cn = null;
?>