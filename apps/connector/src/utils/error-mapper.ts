/**
 * Maps raw low-level Node.js net, TLS, and MQTT library error codes or messages
 * to user-friendly, descriptive, and actionable strings.
 */
export function mapBrokerError(err: any): string {
  if (!err) return "An unknown error occurred during connection.";

  const message = String(err.message || err).trim();
  const code = String(err.code || "").toUpperCase();

  // 1. TCP/Network level errors
  if (code === "ECONNREFUSED") {
    return "Connection refused. Make sure the broker is running on the specified port and is accepting external connections.";
  }
  if (code === "ENOTFOUND") {
    return "Host not found. Please double-check the broker domain or IP address.";
  }
  if (code === "ETIMEDOUT") {
    return "Connection timed out. Check if the broker is online and verify your network and firewall settings.";
  }
  if (code === "EADDRNOTAVAIL") {
    return "Address not available. Please verify the broker host and port.";
  }
  if (code === "EHOSTUNREACH") {
    return "Host unreachable. Check your network connection or firewall rules.";
  }
  if (code === "ECONNRESET" || message.toUpperCase().includes("ECONNRESET")) {
    return "Connection abruptly reset by the broker (ECONNRESET). This often happens if the broker is overloaded, misconfigured, or rejects the client's network/address.";
  }
  if (message.toLowerCase().includes("connack timeout")) {
    return "Connection timed out waiting for the broker's response (CONNACK timeout). Verify that the address/port is correct and that an MQTT broker is running on that port.";
  }

  // 2. TLS/Certificate level errors
  if (code === "DEPTH_ZERO_SELF_SIGNED_CERT" || message.includes("self signed certificate")) {
    return "Self-signed certificate detected. To connect anyway, expand 'TLS Settings' and turn off 'Verify Server Certificate'.";
  }
  if (code === "CERT_HAS_EXPIRED" || message.includes("certificate has expired")) {
    return "The broker's TLS certificate has expired. Please update the certificate on the broker.";
  }
  if (code === "CERT_NOT_YET_VALID") {
    return "The broker's TLS certificate is not yet valid. Please check your local system clock.";
  }
  if (
    code === "ERR_TLS_CERT_ALTNAME_INVALID" ||
    message.includes("Host name mismatch") ||
    message.includes("IP address mismatch") ||
    message.includes("hostname/IP does not match certificate's altnames")
  ) {
    return "TLS hostname mismatch. The certificate common name (CN) or subject alternative name (SAN) does not match the broker's address.";
  }
  if (
    code === "UNABLE_TO_GET_ISSUER_CERT" ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    message.includes("unable to verify the first certificate") ||
    message.includes("unable to get local issuer certificate")
  ) {
    return "Unable to verify the TLS certificate authority (CA) chain. Try uploading your custom CA certificate under 'TLS Settings'.";
  }

  // 3. MQTT protocol level errors
  if (
    message.includes("Bad username or password") ||
    message.includes("bad user name or password") ||
    message.includes("Connection refused: Bad username or password")
  ) {
    return "Incorrect username or password. Please verify your credentials.";
  }
  if (
    message.includes("Not authorized") ||
    message.includes("not authorized") ||
    message.includes("Connection refused: Not authorized")
  ) {
    return "Not authorized. The broker is rejecting connection requests from this client.";
  }
  if (
    message.includes("Identifier rejected") ||
    message.includes("identifier rejected") ||
    message.includes("Connection refused: Identifier rejected")
  ) {
    return "Client ID rejected. The broker is rejecting this specific client ID. Try a different one.";
  }
  if (
    message.includes("Server unavailable") ||
    message.includes("server unavailable") ||
    message.includes("Connection refused: Server unavailable")
  ) {
    return "The MQTT broker is currently unavailable or refusing connections.";
  }
  if (
    message.includes("Unacceptable protocol version") ||
    message.includes("unacceptable protocol version") ||
    message.includes("Connection refused: Unacceptable protocol version")
  ) {
    return "Unacceptable MQTT protocol version. The broker does not support the requested protocol level.";
  }

  // Fallback to error message if any
  return message || "Failed to establish a connection to the MQTT broker.";
}
