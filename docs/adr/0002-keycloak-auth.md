# Keycloak for authentication

The backend API is secured with a Keycloak realm (`https://auth.lausi95.net/realms/stringpro`) and requires a Bearer JWT on every endpoint. The frontend must use the same realm — there is no alternative auth provider in play. All routes are wrapped in a Keycloak provider; the app never renders UI before a valid token is confirmed.
