const { beforeUserCreated, beforeUserSignedIn } = require("firebase-functions/v2/identity");

const authenticatedClaims = {
  role: "authenticated",
};

exports.beforeZerosUserCreated = beforeUserCreated(() => ({
  customClaims: authenticatedClaims,
}));

exports.beforeZerosUserSignedIn = beforeUserSignedIn(() => ({
  customClaims: authenticatedClaims,
}));
