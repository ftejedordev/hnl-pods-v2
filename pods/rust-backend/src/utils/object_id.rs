use bson::oid::ObjectId;
use serde::{self, Deserialize, Deserializer, Serializer};

/// Serialize ObjectId as hex string
#[allow(dead_code)]
pub fn serialize<S>(oid: &ObjectId, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_str(&oid.to_hex())
}

/// Deserialize hex string as ObjectId
#[allow(dead_code)]
pub fn deserialize<'de, D>(deserializer: D) -> Result<ObjectId, D::Error>
where
    D: Deserializer<'de>,
{
    let s = String::deserialize(deserializer)?;
    ObjectId::parse_str(&s).map_err(serde::de::Error::custom)
}

/// Module for Option<ObjectId> serde
#[allow(dead_code)]
pub mod option {
    use bson::oid::ObjectId;
    use serde::{self, Deserialize, Deserializer, Serializer};

    pub fn serialize<S>(oid: &Option<ObjectId>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match oid {
            Some(oid) => serializer.serialize_str(&oid.to_hex()),
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<ObjectId>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let opt: Option<String> = Option::deserialize(deserializer)?;
        match opt {
            Some(s) => ObjectId::parse_str(&s)
                .map(Some)
                .map_err(serde::de::Error::custom),
            None => Ok(None),
        }
    }
}
