import Keycloak from 'keycloak-js'

const keycloak = new Keycloak({
  url: 'https://auth.lausi95.net',
  realm: 'stringpro',
  clientId: 'stringpro',
})

export default keycloak
