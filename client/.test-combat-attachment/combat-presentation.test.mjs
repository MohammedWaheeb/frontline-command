// tests/runtime/combat-presentation.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { create } from "@bufbuild/protobuf";

// src/protocol/frontline_pb.ts
import { fileDesc, messageDesc } from "@bufbuild/protobuf/codegenv2";
var file_frontline = /* @__PURE__ */ fileDesc("Cg9mcm9udGxpbmUucHJvdG8SDGZyb250bGluZS52MSKFBAoIRW52ZWxvcGUSKgoFaGVsbG8YASABKAsyGS5mcm9udGxpbmUudjEuQ2xpZW50SGVsbG9IABIqCgZvcmRlcnMYAiABKAsyGC5mcm9udGxpbmUudjEuT3JkZXJCYXRjaEgAEjEKDG9yZGVyX3Jlc3VsdBgDIAEoCzIZLmZyb250bGluZS52MS5PcmRlclJlc3VsdEgAEjAKCHNuYXBzaG90GAQgASgLMhwuZnJvbnRsaW5lLnYxLlBsYXllclNuYXBzaG90SAASKQoFZGVsdGEYBSABKAsyGC5mcm9udGxpbmUudjEuU3RhdGVEZWx0YUgAEisKBnJlc3VtZRgGIAEoCzIZLmZyb250bGluZS52MS5SZXN1bWVNYXRjaEgAEisKBnJlc3VsdBgHIAEoCzIZLmZyb250bGluZS52MS5NYXRjaFJlc3VsdEgAEiwKBWVycm9yGAggASgLMhsuZnJvbnRsaW5lLnYxLlByb3RvY29sRXJyb3JIABIiCgRwaW5nGAkgASgLMhIuZnJvbnRsaW5lLnYxLlBpbmdIABItCgdjb250cm9sGAogASgLMhouZnJvbnRsaW5lLnYxLk1hdGNoQ29udHJvbEgAEisKBnN0YXR1cxgLIAEoCzIZLmZyb250bGluZS52MS5NYXRjaFN0YXR1c0gAQgkKB21lc3NhZ2UiagoLQ2xpZW50SGVsbG8SEAoIcHJvdG9jb2wYASABKA0SEgoKc2ltdWxhdGlvbhgCIAEoCRIUCgxjb250ZW50X2hhc2gYAyABKAkSDQoFdG9rZW4YBCABKAkSEAoIbWF0Y2hfaWQYBSABKAkiSgoLUmVzdW1lTWF0Y2gSKAoFaGVsbG8YASABKAsyGS5mcm9udGxpbmUudjEuQ2xpZW50SGVsbG8SEQoJbGFzdF90aWNrGAIgASgNIh4KDE1hdGNoQ29udHJvbBIOCgZhY3Rpb24YASABKAkiVAoPQ29ubmVjdGlvblN0YXRlEg4KBnBsYXllchgBIAEoDRIRCgljb25uZWN0ZWQYAiABKAgSHgoWcmVjb25uZWN0X3JlbWFpbmluZ19tcxgDIAEoDSKYAQoLTWF0Y2hTdGF0dXMSFQoNcGF1c2VfZW5hYmxlZBgBIAEoCBIOCgZwYXVzZWQYAiABKAgSEwoLcGF1c2Vfdm90ZXMYAyADKA0SMAoJdGVhbW1hdGVzGAQgAygLMh0uZnJvbnRsaW5lLnYxLkNvbm5lY3Rpb25TdGF0ZRIbChN3YWl0aW5nX2Zvcl9wbGF5ZXJzGAUgASgIIhUKBFBpbmcSDQoFbm9uY2UYASABKA0iQwoNUHJvdG9jb2xFcnJvchIMCgRjb2RlGAEgASgJEg8KB21lc3NhZ2UYAiABKAkSEwoLcmVjb3ZlcmFibGUYAyABKAgiGwoDVmVjEgkKAXgYASABKBESCQoBeRgCIAEoESKsAQoFT3JkZXISDAoEa2luZBgBIAEoCRIQCghlbnRpdGllcxgCIAMoDRIOCgZ0YXJnZXQYAyABKA0SIwoIcG9zaXRpb24YBCABKAsyES5mcm9udGxpbmUudjEuVmVjEgwKBHR5cGUYBSABKAkSDgoGcXVldWVkGAYgASgIEg0KBWluZGV4GAcgASgFEiEKBnBvaW50cxgIIAMoCzIRLmZyb250bGluZS52MS5WZWMiQwoKT3JkZXJCYXRjaBIQCghzZXF1ZW5jZRgBIAEoDRIjCgZvcmRlcnMYAiADKAsyEy5mcm9udGxpbmUudjEuT3JkZXIibAoLT3JkZXJSZXN1bHQSDgoGcGxheWVyGAEgASgNEhAKCHNlcXVlbmNlGAIgASgNEg0KBWluZGV4GAMgASgFEhAKCGFjY2VwdGVkGAQgASgIEgwKBGNvZGUYBSABKAkSDAoEdGljaxgGIAEoDSJ6CghNZXRhZGF0YRISCgpzaW11bGF0aW9uGAEgASgJEhAKCHByb3RvY29sGAIgASgNEhQKDGNvbnRlbnRfaGFzaBgDIAEoCRITCgttYXBfdmVyc2lvbhgEIAEoCRIPCgdydWxlc2V0GAUgASgJEgwKBHNlZWQYBiABKAQiJQoIQ29vbGRvd24SCgoCaWQYASABKAkSDQoFdW50aWwYAiABKA0imAEKA0pvYhIMCgR0eXBlGAEgASgJEhAKCHJlc2VhcmNoGAIgASgIEgwKBHBhaWQYAyABKAMSDAoEd29yaxgEIAEoDRIQCghyZXF1aXJlZBgFIAEoDRIOCgZzdXBwbHkYBiABKAUSDwoHc2VydmljZRgHIAEoDRIPCgdzdGFydGVkGAggASgIEhEKCWVtZXJnZW5jeRgJIAEoCCKLAgoHRWNvbm9teRIPCgdjcmVkaXRzGAEgASgDEg4KBmVuZXJneRgCIAEoAxIOCgZzdXBwbHkYAyABKAUSFwoPcmVzZXJ2ZWRfc3VwcGx5GAQgASgFEhYKDnBvd2VyX2NhcGFjaXR5GAUgASgFEhQKDHBvd2VyX2RlbWFuZBgGIAEoBRIMCgR0aWVyGAcgASgFEg4KBmluY29tZRgIIAEoAxIWCg5yZXBhaXJfcmVzZXJ2ZRgJIAEoAxIQCgh1cGdyYWRlcxgKIAMoCRIpCgljb29sZG93bnMYCyADKAsyFi5mcm9udGxpbmUudjEuQ29vbGRvd24SFQoNbGFzdF9zZXF1ZW5jZRgMIAEoDSK4AwoNRW50aXR5UHJpdmF0ZRIKCgJocBgBIAEoAxIOCgZtYXhfaHAYAiABKAMSHwoEam9icxgDIAMoCzIRLmZyb250bGluZS52MS5Kb2ISIwoGb3JkZXJzGAQgAygLMhMuZnJvbnRsaW5lLnYxLk9yZGVyEiAKBXJhbGx5GAUgASgLMhEuZnJvbnRsaW5lLnYxLlZlYxINCgVjYXJnbxgGIAEoAxIMCgRob21lGAcgASgNEgwKBGFtbW8YCCABKAUSEQoJZW5kdXJhbmNlGAkgASgNEg8KB2NoYXJnZXMYCiABKAUSEwoLY2hhcmdlX3dvcmsYCyABKA0SFAoMc2VydmljZV93b3JrGAwgASgNEhIKCmV4cGVyaWVuY2UYDSABKAMSKQoJY29vbGRvd25zGA4gAygLMhYuZnJvbnRsaW5lLnYxLkNvb2xkb3duEhIKCnBhc3NlbmdlcnMYDyADKA0SEQoJY29udGFpbmVyGBAgASgNEhUKDXJlcGVhdF9zb3J0aWUYESABKAgSFAoMYW1idXNoX3JlYWR5GBIgASgIEhYKDm1pc3Npb25fb3JpZ2luGBMgASgJIrgDCgZFbnRpdHkSCgoCaWQYASABKA0SDAoEdHlwZRgCIAEoCRINCgVvd25lchgDIAEoDRIjCghwb3NpdGlvbhgEIAEoCzIRLmZyb250bGluZS52MS5WZWMSDgoGZmFjaW5nGAUgASgFEg4KBmhlYWx0aBgGIAEoBRINCgVzdGF0ZRgHIAEoCRIQCghjb21wbGV0ZRgIIAEoCBIPCgdlbmFibGVkGAkgASgIEg4KBmxhbmRlZBgKIAEoCBIQCghkZXBsb3llZBgLIAEoCBIRCgljb25jZWFsZWQYDCABKAgSEAoIcHJvZ3Jlc3MYDSABKAUSDAoEcmFuaxgOIAEoDRIsCgdwcml2YXRlGA8gASgLMhsuZnJvbnRsaW5lLnYxLkVudGl0eVByaXZhdGUSFQoNdHVycmV0X2ZhY2luZxgQIAEoBRIVCg1jaGFubmVsX3VudGlsGBEgASgNEhIKCm1hcF9vYmplY3QYEiABKA0SFwoPZm9vdHByaW50X3dpZHRoGBMgASgFEhgKEGZvb3RwcmludF9oZWlnaHQYFCABKAUSFgoOZm9vdHByaW50X3R5cGUYFSABKAkisAEKDVBsYXllclN1bW1hcnkSCgoCaWQYASABKA0SDAoEbmFtZRgCIAEoCRIPCgdmYWN0aW9uGAMgASgJEgwKBHRlYW0YBCABKA0SEAoIZGVmZWF0ZWQYBSABKAgSEQoJZGVmZWF0X2F0GAYgASgNEhoKEnN0cmF0ZWdpY19wcm9ncmVzcxgHIAEoBRIWCg5zdXJyZW5kZXJfdm90ZRgIIAEoCBINCgVjb2xvchgJIAEoDSK6AQoKUHJvamVjdGlsZRIKCgJpZBgBIAEoDRINCgVvd25lchgCIAEoDRIOCgZ3ZWFwb24YAyABKAkSIwoIcG9zaXRpb24YBCABKAsyES5mcm9udGxpbmUudjEuVmVjEiEKBmltcGFjdBgFIAEoCzIRLmZyb250bGluZS52MS5WZWMSEQoJaW1wYWN0X2F0GAYgASgNEhUKDWludGVyY2VwdGFibGUYByABKAgSDwoHd2FybmluZxgIIAEoCCJLCgVGaWVsZBIKCgJpZBgBIAEoDRIjCghwb3NpdGlvbhgCIAEoCzIRLmZyb250bGluZS52MS5WZWMSEQoJcmVtYWluaW5nGAMgASgDIkkKB1N0YXRpb24SCgoCaWQYASABKA0SIwoIcG9zaXRpb24YAiABKAsyES5mcm9udGxpbmUudjEuVmVjEg0KBW93bmVyGAMgASgNIq8BCgZNZW1vcnkSCgoCaWQYASABKA0SDAoEdHlwZRgCIAEoCRINCgVvd25lchgDIAEoDRIjCghwb3NpdGlvbhgEIAEoCzIRLmZyb250bGluZS52MS5WZWMSDAoEc2VlbhgFIAEoDRIXCg9mb290cHJpbnRfd2lkdGgYBiABKAUSGAoQZm9vdHByaW50X2hlaWdodBgHIAEoBRIWCg5mb290cHJpbnRfdHlwZRgIIAEoCSKfAQoFRXZlbnQSCgoCaWQYASABKA0SDAoEdGljaxgCIAEoDRIMCgRraW5kGAMgASgJEg0KBW93bmVyGAQgASgNEg4KBmVudGl0eRgFIAEoDRIjCghwb3NpdGlvbhgGIAEoCzIRLmZyb250bGluZS52MS5WZWMSDQoFdmFsdWUYByABKAMSDQoFc2NvcGUYCCABKAkSDAoEdGV4dBgJIAEoCSJdCgdPdXRjb21lEhAKCGZpbmlzaGVkGAEgASgIEgwKBGRyYXcYAiABKAgSFAoMd2lubmluZ190ZWFtGAMgASgNEg4KBnJlYXNvbhgEIAEoCRIMCgR0aWNrGAUgASgNIuAGCg5QbGF5ZXJTbmFwc2hvdBIoCghtZXRhZGF0YRgBIAEoCzIWLmZyb250bGluZS52MS5NZXRhZGF0YRIMCgR0aWNrGAIgASgNEhEKCWNvdW50ZG93bhgDIAEoDRIOCgZwbGF5ZXIYBCABKA0SJgoHZWNvbm9teRgFIAEoCzIVLmZyb250bGluZS52MS5FY29ub215EiwKB3BsYXllcnMYBiADKAsyGy5mcm9udGxpbmUudjEuUGxheWVyU3VtbWFyeRImCghlbnRpdGllcxgHIAMoCzIULmZyb250bGluZS52MS5FbnRpdHkSLQoLcHJvamVjdGlsZXMYCCADKAsyGC5mcm9udGxpbmUudjEuUHJvamVjdGlsZRIjCgZmaWVsZHMYCSADKAsyEy5mcm9udGxpbmUudjEuRmllbGQSJwoIc3RhdGlvbnMYCiADKAsyFS5mcm9udGxpbmUudjEuU3RhdGlvbhIUCghleHBsb3JlZBgLIAMoCEICEAESEwoHdmlzaWJsZRgMIAMoCEICEAESJAoGbWVtb3J5GA0gAygLMhQuZnJvbnRsaW5lLnYxLk1lbW9yeRIjCgZldmVudHMYDiADKAsyEy5mcm9udGxpbmUudjEuRXZlbnQSKgoHcmVzdWx0cxgPIAMoCzIZLmZyb250bGluZS52MS5PcmRlclJlc3VsdBITCgtzaGlwbWVudF9hdBgQIAEoDRImCgdvdXRjb21lGBEgASgLMhUuZnJvbnRsaW5lLnYxLk91dGNvbWUSJgoHc2FsdmFnZRgSIAMoCzIVLmZyb250bGluZS52MS5TYWx2YWdlEiEKBXpvbmVzGBMgAygLMhIuZnJvbnRsaW5lLnYxLlpvbmUSNAoKaW5kaWNhdG9ycxgUIAMoCzIgLmZyb250bGluZS52MS5TdHJ1Y3R1cmVJbmRpY2F0b3ISLgoHbWlzc2lvbhgVIAEoCzIdLmZyb250bGluZS52MS5NaXNzaW9uUHJvZ3Jlc3MSDgoGcnViYmxlGBYgAygNEjAKCHdhcm5pbmdzGBcgAygLMh4uZnJvbnRsaW5lLnYxLk9wZXJhdGlvbldhcm5pbmcSJgoHZGVicmllZhgYIAEoCzIVLmZyb250bGluZS52MS5EZWJyaWVmImoKClN0YXRlRGVsdGESFQoNYmFzZWxpbmVfdGljaxgBIAEoDRIrCgVzdGF0ZRgCIAEoCzIcLmZyb250bGluZS52MS5QbGF5ZXJTbmFwc2hvdBIYChByZW1vdmVkX2VudGl0aWVzGAMgAygNImgKC01hdGNoUmVzdWx0EhAKCG1hdGNoX2lkGAEgASgJEiYKB291dGNvbWUYAiABKAsyFS5mcm9udGxpbmUudjEuT3V0Y29tZRIRCgljb21taXR0ZWQYAyABKAgSDAoEdm9pZBgEIAEoCCJnCgdTYWx2YWdlEgoKAmlkGAEgASgNEg0KBW93bmVyGAIgASgNEiMKCHBvc2l0aW9uGAMgASgLMhEuZnJvbnRsaW5lLnYxLlZlYxINCgV2YWx1ZRgEIAEoAxINCgV1bnRpbBgFIAEoDSJ2CgRab25lEgwKBGtpbmQYASABKAkSDQoFb3duZXIYAiABKA0SIwoIcG9zaXRpb24YAyABKAsyES5mcm9udGxpbmUudjEuVmVjEg4KBnJhZGl1cxgEIAEoBRINCgVzdGFydBgFIAEoDRINCgV1bnRpbBgGIAEoDSJIChJTdHJ1Y3R1cmVJbmRpY2F0b3ISDQoFb3duZXIYASABKA0SIwoIcG9zaXRpb24YAiABKAsyES5mcm9udGxpbmUudjEuVmVjIoYBChFPYmplY3RpdmVQcm9ncmVzcxIKCgJpZBgBIAEoCRIMCgR0ZXh0GAIgASgJEhAKCG9wdGlvbmFsGAMgASgIEg8KB2ZhaWx1cmUYBCABKAgSEAoIY29tcGxldGUYBSABKAgSEAoIcHJvZ3Jlc3MYBiABKA0SEAoIcmVxdWlyZWQYByABKA0i4gEKD01pc3Npb25Qcm9ncmVzcxIKCgJpZBgBIAEoCRINCgV0aXRsZRgCIAEoCRISCgpkaWZmaWN1bHR5GAMgASgJEhIKCmNoZWNrcG9pbnQYBCABKAkSFwoPY2hlY2twb2ludF90aWNrGAUgASgNEjMKCm9iamVjdGl2ZXMYBiADKAsyHy5mcm9udGxpbmUudjEuT2JqZWN0aXZlUHJvZ3Jlc3MSLQoHY29udm95cxgHIAMoCzIcLmZyb250bGluZS52MS5Db252b3lQcm9ncmVzcxIPCgd2ZXJzaW9uGAggASgJIpIBChBPcGVyYXRpb25XYXJuaW5nEgwKBGtpbmQYASABKAkSDQoFb3duZXIYAiABKA0SIwoIcG9zaXRpb24YAyABKAsyES5mcm9udGxpbmUudjEuVmVjEgoKAmF0GAQgASgNEg4KBnNvdXJjZRgFIAEoDRIgCgVleGl0cxgGIAMoCzIRLmZyb250bGluZS52MS5WZWMiqQEKDkNvbnZveVByb2dyZXNzEgoKAmlkGAEgASgJEg4KBmFjdGl2ZRgCIAEoCBIRCgljb21wbGV0ZWQYAyABKAgSDAoEaGVsZBgEIAEoCBIOCgZtb3ZpbmcYBSABKAgSDQoFcm91dGUYBiABKA0SEAoId2F5cG9pbnQYByABKA0SFwoPY291bnRkb3duX3VudGlsGAggASgNEhAKCGFwcHJvdmVkGAkgAygNIm8KDUVjb25vbXlTYW1wbGUSDAoEdGljaxgBIAEoDRIPCgdjcmVkaXRzGAIgASgDEg4KBmluY29tZRgDIAEoAxINCgVzcGVudBgEIAEoAxIOCgZzdXBwbHkYBSABKAUSEAoIc3RhdGlvbnMYBiABKA0iLgoPUHJvZHVjdGlvbkNvdW50EgwKBHR5cGUYASABKAkSDQoFY291bnQYAiABKA0i2QIKD1BsYXllclRlbGVtZXRyeRIOCgZwbGF5ZXIYASABKA0SNQoOdW5pdHNfcHJvZHVjZWQYAiADKAsyHS5mcm9udGxpbmUudjEuUHJvZHVjdGlvbkNvdW50EjwKFWJ1aWxkaW5nc19jb25zdHJ1Y3RlZBgDIAMoCzIdLmZyb250bGluZS52MS5Qcm9kdWN0aW9uQ291bnQSEgoKdW5pdHNfbG9zdBgEIAEoDRIWCg5idWlsZGluZ3NfbG9zdBgFIAEoDRIUCgxyZXBhaXJfc3BlbnQYBiABKAMSFQoNbWlzc2lsZV9zcGVudBgHIAEoAxIaChJpbnRlcmNlcHRvcnNfZmlyZWQYCCABKA0SHQoVc3RhdGlvbl9jb250cm9sX3RpY2tzGAkgASgNEi0KCHRpbWVsaW5lGAogAygLMhsuZnJvbnRsaW5lLnYxLkVjb25vbXlTYW1wbGUisAIKDURlYnJpZWZQbGF5ZXISDgoGcGxheWVyGAEgASgNEgwKBG5hbWUYAiABKAkSDwoHZmFjdGlvbhgDIAEoCRIMCgR0ZWFtGAQgASgNEg0KBWNvbG9yGAUgASgNEhAKCGRlZmVhdGVkGAYgASgIEg8KB2NyZWRpdHMYByABKAMSDgoGaW5jb21lGAggASgDEg0KBXNwZW50GAkgASgDEhIKCmxvc3RfdmFsdWUYCiABKAMSFwoPdW5pdHNfc3Vydml2aW5nGAsgASgNEhwKFHN0cnVjdHVyZXNfc3Vydml2aW5nGAwgASgNEhYKDmV4cGxvcmVkX3RpbGVzGA0gASgNEi4KB21ldHJpY3MYDiABKAsyHS5mcm9udGxpbmUudjEuUGxheWVyVGVsZW1ldHJ5IlYKDERlYnJpZWZFdmVudBIMCgR0aWNrGAEgASgNEgwKBGtpbmQYAiABKAkSDgoGcGxheWVyGAMgASgNEgwKBHR5cGUYBCABKAkSDAoEdGV4dBgFIAEoCSJ7CgdEZWJyaWVmEiwKB3BsYXllcnMYASADKAsyGy5mcm9udGxpbmUudjEuRGVicmllZlBsYXllchIqCgZldmVudHMYAiADKAsyGi5mcm9udGxpbmUudjEuRGVicmllZkV2ZW50EhYKDm9taXR0ZWRfZXZlbnRzGAMgASgNQiRaImZyb250bGluZWNvbW1hbmQvcHJvdG9jb2w7cHJvdG9jb2xiBnByb3RvMw");
var EventSchema = /* @__PURE__ */ messageDesc(file_frontline, 23);
var PlayerSnapshotSchema = /* @__PURE__ */ messageDesc(file_frontline, 25);

// src/content/catalog.ts
var CatalogIndex = class {
  constructor(raw) {
    this.raw = raw;
    for (const u of raw.units ?? []) this.units.set(u.id, u);
    for (const b of raw.buildings ?? []) this.buildings.set(b.id, b);
    for (const u of raw.upgrades ?? []) this.upgrades.set(u.id, u);
    for (const w of raw.weapons ?? []) this.weapons.set(w.id, w);
    for (const object of raw.object_classes ?? []) this.objects.set(object.id, object);
  }
  raw;
  units = /* @__PURE__ */ new Map();
  buildings = /* @__PURE__ */ new Map();
  upgrades = /* @__PURE__ */ new Map();
  weapons = /* @__PURE__ */ new Map();
  objects = /* @__PURE__ */ new Map();
  name(type) {
    return this.units.get(type)?.name ?? this.buildings.get(type)?.name ?? this.upgrades.get(type)?.name ?? mapObjectName(type) ?? type;
  }
  isBuilding(type) {
    return this.buildings.has(type);
  }
  unitClass(type) {
    const u = this.units.get(type);
    return u ? classify(u) : "vehicle";
  }
  cost(type) {
    return this.units.get(type)?.cost ?? this.buildings.get(type)?.cost ?? this.upgrades.get(type)?.cost;
  }
  buildTicks(type) {
    return this.units.get(type)?.build_ticks ?? this.buildings.get(type)?.build_ticks ?? this.upgrades.get(type)?.build_ticks;
  }
};
function mapObjectName(type) {
  if (type.startsWith("map.")) return type.slice(4).replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return void 0;
}
var AIR_ROLES = /* @__PURE__ */ new Set(["fighter", "strike", "gunship", "airlift", "isr", "scout_drone"]);
function classify(u) {
  if (u.armor === "infantry") return "infantry";
  if (AIR_ROLES.has(u.role)) return u.faction === "IR" || u.role === "scout_drone" ? "drone" : u.role === "gunship" || u.role === "airlift" ? "rotor" : "aircraft";
  if (u.role === "tank") return "tank";
  if (["rig", "hauler", "repair"].includes(u.role)) return "support";
  return "vehicle";
}

// src/app/combat-feedback.ts
var ARMOR = /* @__PURE__ */ new Set(["infantry", "light", "heavy", "structure", "air"]);
var special = (id) => id === "SATURATION" || id === "SKYBREAKER";
function combatFacts(event2, snapshot2, catalog2) {
  const raw = event2.combat;
  const out = { metadata: raw === void 0 || raw === null ? "absent" : "invalid", hit: false, coverMitigated: false };
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !["weapon_fired", "impact"].includes(event2.kind)) return out;
  const c = raw;
  if (typeof c.weapon !== "string") return out;
  const weapon = catalog2.weapons.get(c.weapon);
  if (!weapon && !special(c.weapon)) return out;
  out.metadata = "known";
  out.weapon = c.weapon;
  out.weaponKind = special(c.weapon) ? "strategic" : weapon?.kind;
  if (event2.kind !== "impact" || c.outcome !== "hit" || typeof c.targetArmor !== "string" || !ARMOR.has(c.targetArmor) || !Number.isInteger(event2.entity) || event2.entity <= 0) return out;
  if (special(c.weapon) || weapon?.kind === "tactical" || typeof weapon?.splash === "number" && weapon.splash > 0) return out;
  const target = snapshot2.entities.find((entity) => entity.id === event2.entity);
  if (!target || target.state === "destroyed" || target.health <= 0 || target.private?.container) return out;
  out.hit = true;
  out.target = target.id;
  out.targetArmor = c.targetArmor;
  out.coverMitigated = c.coverMitigated === true && c.targetArmor === "infantry" && ["small", "auto"].includes(weapon?.kind ?? "");
  return out;
}

// src/app/combat-presentation.ts
var duration = { muzzle: 6, "interceptor-launch": 10, impact: 12, hit: 14, intercepted: 30, decoy: 30, destroyed: 32 };
var point = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : void 0;
function combatCue(event2, snapshot2, catalog2) {
  const position = point(event2.position);
  if (!position || !Number.isSafeInteger(event2.id) || event2.id <= 0 || !Number.isSafeInteger(event2.tick) || event2.tick < 0 || event2.tick > snapshot2.tick) return;
  if (event2.scope === "owner" && event2.owner !== snapshot2.player) return;
  if (event2.scope === "team" && event2.owner !== snapshot2.player) {
    const us = snapshot2.players.find((p) => p.id === snapshot2.player), them = snapshot2.players.find((p) => p.id === event2.owner);
    if (!us || !them || us.team !== them.team) return;
  }
  let kind, effects = [];
  const facts = combatFacts(event2, snapshot2, catalog2);
  if (event2.kind === "weapon_fired") {
    kind = "muzzle";
    if (facts.weapon && catalog2.weapons.has(facts.weapon)) effects = [`fx.weapon_muzzle.${facts.weapon}`];
  } else if (event2.kind === "interceptor_fired") kind = "interceptor-launch";
  else if (event2.kind === "impact") {
    kind = facts.hit ? "hit" : "impact";
    const splash = facts.weapon === "SATURATION" || facts.weapon === "SKYBREAKER" ? 2e3 : catalog2.weapons.get(facts.weapon ?? "")?.splash;
    effects = [facts.hit ? `fx.impact.hit_${facts.targetArmor}` : splash === 2e3 ? "fx.explosion.blast_radius_2" : splash === 1500 ? "fx.explosion.blast_radius_1_5" : "fx.explosion.small"];
    if (facts.coverMitigated) effects.push("fx.impact.cover_mitigated");
  } else if (event2.kind === "missile_intercepted") {
    kind = "intercepted";
    effects = ["fx.impact.intercepted_missile"];
  } else if (event2.kind === "decoy_triggered") {
    kind = "decoy";
    effects = ["fx.impact.decoy_defeat"];
  } else if (event2.kind === "destroyed") {
    kind = "destroyed";
    effects = ["fx.explosion.small"];
  } else return;
  const until = event2.tick + duration[kind];
  if (until <= snapshot2.tick) return;
  const entity = snapshot2.entities.find((e) => e.id === event2.entity && e.health > 0 && e.state !== "destroyed" && !e.private?.container);
  const anchor = kind === "hit" ? facts.target : ["muzzle", "interceptor-launch", "decoy"].includes(kind) ? entity?.id : void 0;
  return { key: `${snapshot2.player}:${event2.id}`, id: event2.id, tick: event2.tick, until, kind, position, weapon: facts.weapon, armor: facts.targetArmor, cover: facts.coverMitigated, anchor, effects };
}
var CombatTimeline = class {
  player;
  tick = -1;
  highWater = 0;
  cues = [];
  traces = /* @__PURE__ */ new Map();
  get values() {
    return this.cues;
  }
  get projectiles() {
    return [...this.traces.values()];
  }
  reset(snapshot2) {
    this.cues = [];
    this.traces.clear();
    this.player = snapshot2?.player;
    this.tick = snapshot2?.tick ?? -1;
    this.highWater = snapshot2 ? this.watermark(snapshot2) : 0;
  }
  watermark(snapshot2) {
    let max = 0;
    for (const e of snapshot2.events) if (e.tick <= snapshot2.tick && Number.isSafeInteger(e.id)) max = Math.max(max, e.id);
    return max;
  }
  sync(snapshot2, catalog2, bodies = [], replace = false) {
    const reset = replace || this.player === void 0 || snapshot2.player !== this.player || snapshot2.tick < this.tick || snapshot2.tick - this.tick > 40;
    if (reset) this.reset(snapshot2);
    const live = new Set(snapshot2.entities.filter((e) => e.health > 0 && e.state !== "destroyed" && !e.private?.container).map((e) => e.id));
    this.cues = this.cues.filter((cue) => cue.until > snapshot2.tick && (cue.anchor === void 0 || live.has(cue.anchor)));
    if (!reset) {
      const events = snapshot2.events.filter((event2) => Number.isSafeInteger(event2.id) && Number.isSafeInteger(event2.tick) && event2.tick >= 0 && event2.tick <= snapshot2.tick && event2.id > this.highWater).sort((a, b) => a.id - b.id);
      for (const event2 of events) {
        if (event2.id <= this.highWater) continue;
        this.highWater = event2.id;
        const cue = combatCue(event2, snapshot2, catalog2);
        if (cue) this.cues.push(cue);
      }
    }
    const next = /* @__PURE__ */ new Map();
    for (const body2 of bodies) {
      const position = point(body2.bodyPosition);
      if (!position) continue;
      const previous = this.traces.get(body2.id), compatible = previous?.owner === body2.owner && previous.weapon === body2.weapon;
      const samples = compatible ? previous.samples.filter((sample) => sample.tick > snapshot2.tick - 6).map((sample) => ({ tick: sample.tick, position: { ...sample.position } })) : [];
      const last = samples.at(-1);
      if (last?.tick === snapshot2.tick) last.position = position;
      else samples.push({ tick: snapshot2.tick, position });
      next.set(body2.id, { id: body2.id, owner: body2.owner, weapon: body2.weapon, effect: body2.bodyEffect, samples: samples.slice(-4) });
    }
    this.traces = next;
    this.player = snapshot2.player;
    this.tick = snapshot2.tick;
  }
};

// tests/runtime/combat-presentation.test.ts
var catalog = new CatalogIndex(JSON.parse(readFileSync("../pkg/content/rules.json", "utf8")));
var event = (id = 1, kind = "impact", tick = 100, combat = { weapon: "RIF", outcome: "hit", targetArmor: "infantry", coverMitigated: true }) => Object.assign(create(EventSchema, { id, kind, tick, entity: 4, position: { x: 4e3, y: 5e3 }, owner: 2, scope: "visible" }), { combat });
function snapshot(tick = 100, events = [], player = 1) {
  return Object.assign(create(PlayerSnapshotSchema, { tick, player, entities: [{ id: 4, type: "IR.rifle", owner: 2, health: 700, complete: true, enabled: true }], players: [{ id: 1, team: 1 }, { id: 2, team: 2 }, { id: 3, team: 1 }] }), { events });
}
var body = (x, extra = {}) => ({ id: 20, owner: 2, weapon: "TANK", interceptable: false, bodyPosition: { x, y: 6e3 }, bodyEffect: "fx.projectile.shell_cannon", ...extra });
test("confirmed hits and cover select exact art IDs; ambiguity never becomes miss or blocked", () => {
  const e = event(), s = snapshot(100, [e]);
  const cue = combatCue(e, s, catalog);
  assert.equal(cue.kind, "hit");
  assert.equal(cue.armor, "infantry");
  assert.equal(cue.cover, true);
  assert.equal(cue.anchor, 4);
  assert.deepEqual(cue.effects, ["fx.impact.hit_infantry", "fx.impact.cover_mitigated"]);
  for (const meta of [void 0, { weapon: "RIF" }, { weapon: "RIF", outcome: "miss" }, { weapon: "RIF", outcome: "blocked" }, { weapon: "ART", outcome: "hit", targetArmor: "infantry" }]) {
    const ambiguous = combatCue(Object.assign(event(), { combat: meta }), s, catalog);
    assert.equal(ambiguous.kind, "impact");
    assert.equal(ambiguous.anchor, void 0);
    assert.equal(ambiguous.cover, false);
  }
  assert.equal(combatCue(event(1, "impact", 100, { weapon: "ART" }), s, catalog).effects[0], "fx.explosion.blast_radius_2");
  assert.equal(combatCue(event(1, "impact", 100, { weapon: "IR_ART" }), s, catalog).effects[0], "fx.explosion.blast_radius_1_5");
});
test("interception is a warning-point outcome distinct from a launch or decoy", () => {
  const s = snapshot();
  const intercepted = combatCue(event(1, "missile_intercepted"), s, catalog);
  assert.equal(intercepted.kind, "intercepted");
  assert.equal(intercepted.anchor, void 0);
  assert.deepEqual(intercepted.effects, ["fx.impact.intercepted_missile"]);
  const decoy = combatCue(event(2, "decoy_triggered"), s, catalog);
  assert.equal(decoy.kind, "decoy");
  assert.equal(decoy.anchor, 4);
  assert.equal(combatCue(event(3, "interceptor_fired"), s, catalog).kind, "interceptor-launch");
  const muzzle = combatCue(event(4, "weapon_fired", 100, { weapon: "TANK" }), s, catalog);
  assert.equal(muzzle.effects[0], "fx.weapon_muzzle.TANK");
});
test("scope, future events, stale cues and unsupported kinds fail closed", () => {
  const s = snapshot();
  for (const patch of [{ scope: "owner", owner: 2 }, { scope: "team", owner: 2 }, { tick: 101 }, { tick: 60 }, { kind: "route_blocked" }, { position: void 0 }, { id: NaN }]) assert.equal(combatCue({ ...event(), ...patch }, s, catalog), void 0, JSON.stringify(patch));
  assert.ok(combatCue({ ...event(), scope: "team", owner: 3 }, s, catalog));
});
test("timeline deduplicates aggregates, freezes paused tick, expires and ignores future watermark", () => {
  const timeline = new CombatTimeline();
  timeline.sync(snapshot(99), catalog);
  timeline.sync(snapshot(100, [event(3), event(1), event(3), event(2)]), catalog);
  assert.deepEqual(timeline.values.map((c) => c.id), [1, 2, 3]);
  const before = structuredClone(timeline.values);
  timeline.sync(snapshot(100, [event(1), event(2), event(3), event(999, "impact", 101)]), catalog);
  assert.deepEqual(timeline.values, before);
  timeline.sync(snapshot(101, [event(4, "weapon_fired", 101, { weapon: "TANK" }), event(Infinity)]), catalog);
  assert.deepEqual(timeline.values.map((c) => c.id), [1, 2, 3, 4]);
  timeline.sync(snapshot(114), catalog);
  assert.deepEqual(timeline.values, []);
});
test("first load, replacement, perspective, rewind and long gaps establish empty baselines", () => {
  for (const reset of ["first", "replace", "perspective", "rewind", "gap"]) {
    const timeline = new CombatTimeline();
    if (reset !== "first") {
      timeline.sync(snapshot(99), catalog);
      timeline.sync(snapshot(100, [event()]), catalog);
      assert.equal(timeline.values.length, 1);
    }
    const s = reset === "rewind" ? snapshot(80, [event(2, "impact", 80)]) : reset === "gap" ? snapshot(150, [event(2, "impact", 150)]) : snapshot(101, [event(2, "impact", 101)], reset === "perspective" ? 2 : 1);
    timeline.sync(s, catalog, [], reset === "replace");
    assert.deepEqual(timeline.values, [], reset);
    timeline.sync(s, catalog);
    assert.deepEqual(timeline.values, [], reset + " duplicate");
  }
});
test("lost hit anchors disappear immediately, without manufacturing death or hidden locations", () => {
  const timeline = new CombatTimeline();
  timeline.sync(snapshot(99), catalog);
  timeline.sync(snapshot(100, [event()]), catalog);
  const hidden = snapshot(101);
  hidden.entities = [];
  timeline.sync(hidden, catalog);
  assert.deepEqual(timeline.values, []);
  timeline.sync(snapshot(102), catalog);
  assert.deepEqual(timeline.values, []);
});
test("trails retain only successive authorized samples and reset on loss, reuse or replacement", () => {
  const timeline = new CombatTimeline();
  timeline.sync(snapshot(100), catalog, [body(4e3)]);
  timeline.sync(snapshot(101), catalog, [body(4500)]);
  assert.equal(timeline.projectiles[0].samples.length, 2);
  const frozen = structuredClone(timeline.projectiles);
  timeline.sync(snapshot(101), catalog, [body(4500)]);
  assert.deepEqual(timeline.projectiles, frozen);
  timeline.sync(snapshot(102), catalog, [body(5e3, { bodyPosition: void 0 })]);
  assert.equal(timeline.projectiles.length, 0);
  timeline.sync(snapshot(103), catalog, [body(5500)]);
  assert.equal(timeline.projectiles[0].samples.length, 1);
  timeline.sync(snapshot(104), catalog, [body(6e3, { owner: 3 })]);
  assert.equal(timeline.projectiles[0].samples.length, 1);
  timeline.sync(snapshot(105), catalog, [body(6500, { owner: 3 })], true);
  assert.equal(timeline.projectiles[0].samples.length, 1);
  timeline.sync(snapshot(106), catalog, []);
  assert.equal(timeline.projectiles.length, 0);
});
test("full legal actor-scale burst preserves all essential cues independently of decoration budgets", () => {
  const timeline = new CombatTimeline();
  timeline.sync(snapshot(99), catalog);
  const events = Array.from({ length: 688 }, (_, i) => event(i + 1, "missile_intercepted"));
  timeline.sync(snapshot(100, events), catalog);
  assert.equal(timeline.values.length, 688);
  timeline.sync(snapshot(101, events), catalog);
  assert.equal(timeline.values.length, 688);
  timeline.sync(snapshot(130), catalog);
  assert.equal(timeline.values.length, 0);
});
