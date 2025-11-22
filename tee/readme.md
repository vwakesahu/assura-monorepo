Assura Network
Assura Network is a simple, thin layer that sits between your application contract and your users, allowing any app to become compliance-friendly in under an hour.
The core features are designed for three main customer groups:
1. Institutions
Institutions can use GateKeep to offer a verifiable interface for liquidity provision, tokenization of RWAs or stocks, and other financial activity ensuring that only compliant users can access or trade through their interface.
2. App Builders
App builders can instantly launch compliance-ready applications that only allow specific users to interact with their apps, preventing access from sanctioned regions, hacker groups, or other restricted categories. This removes the need for builders to handle compliance logic themselves.
3. Users
For users, we generate attested tax reports that summarize all activity performed with their wallets across both compliant and non-compliant apps making legal and reporting processes significantly easier.
What do we actually provide?
For app builders, we deliver three core programmable compliance values. These values are attested by our TEE (Trusted Execution Environment) and verified on-chain by your contract:
1. Confidence Score
A numeric score between 0–1000 that evaluates a user’s wallet activity and identity level.
 Examples of factors included:
Whether the user has completed self-based KYC
Wallet age / when it was funded
Interaction with privacy protocols
Interaction with sanctioned addresses
Optional full video + passport KYC
Stored securely and encrypted inside the TEE
Grants the maximum confidence score
2. Time
If an app requires a score higher than a user’s confidence score and the user does not want to provide more information, that’s fine. We introduce a new interface where the user’s assets are temporarily held inside a smart account owned entirely by the user.
A time-based lock is applied depending on the app’s required score. During this period:
Funds remain in the user-owned smart account
After time expires, the signed intent can be executed into the protocol
Users can also force-withdraw if they choose
This works with any protocol, since the smart account is fully user-owned and GateKeep only enforces timing rules based on the app’s compliance configuration.
3. Expiry
All attestations include an expiry.
 Once expired, the attestation is no longer valid on-chain and must be refreshed by the user.
Config
All parameters can be configured directly inside your smart contract interface. GateKeep reads this configuration off-chain before issuing any attestations.
You can define:
Required app score
Allowed/blocked country codes (hex format)
Minimum required time
Intermediate controlled account ( with self custody )
Other compliance rules
This allows your application to be fully programmable from deployment or initialization, with compliance deeply integrated and enforced automatically.


create a next 