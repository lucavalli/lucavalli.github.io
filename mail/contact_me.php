<?php
  // Check for empty fields
  if(empty($_POST['name']) || empty($_POST['email']) || empty($_POST['phone']) || empty($_POST['message']) || !filter_var($_POST['email'], FILTER_VALIDATE_EMAIL)) {
    http_response_code(500);
    exit();
  }

  $to = "lucavalli2000@gmail.com"; // this is your Email address
  $name = strip_tags(htmlspecialchars($_POST['name']));
  $from = strip_tags(htmlspecialchars($_POST['email']));
  $phone = strip_tags(htmlspecialchars($_POST['phone']));
  $message = strip_tags(htmlspecialchars($_POST['message']));
  $subject = "Richiesta di contatto tramite form sul sito";
  $subject2 = "Copia del tuo messaggio";
  $message = $name. " ti ha scritto tramite il form di contatto.\n\nQuesti sono i dettagli:\n\nNome: $name\n\nEmail: $email\n\nTelefono: $phone\n\nMessaggio:\n$message";
  $message2 = "Copia del messaggio che hai inviato a Luca Valli: " . "\n\n" .$_POST['message'];
  $headers = "From:" . $from;
  $headers2 = "From: no-reply@lucavalli.com";
  if (!mail($to,$subject,$message,$headers)){
    http_response_code(500);
  }
  mail($from,$subject2,$message2,$headers2); // copia del messaggio al richiedente contatto
?>
