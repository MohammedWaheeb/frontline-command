// tests/runtime/actor-status.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { create } from "@bufbuild/protobuf";

// src/protocol/frontline_pb.ts
import { fileDesc, messageDesc } from "@bufbuild/protobuf/codegenv2";
var file_frontline = /* @__PURE__ */ fileDesc("Cg9mcm9udGxpbmUucHJvdG8SDGZyb250bGluZS52MSKFBAoIRW52ZWxvcGUSKgoFaGVsbG8YASABKAsyGS5mcm9udGxpbmUudjEuQ2xpZW50SGVsbG9IABIqCgZvcmRlcnMYAiABKAsyGC5mcm9udGxpbmUudjEuT3JkZXJCYXRjaEgAEjEKDG9yZGVyX3Jlc3VsdBgDIAEoCzIZLmZyb250bGluZS52MS5PcmRlclJlc3VsdEgAEjAKCHNuYXBzaG90GAQgASgLMhwuZnJvbnRsaW5lLnYxLlBsYXllclNuYXBzaG90SAASKQoFZGVsdGEYBSABKAsyGC5mcm9udGxpbmUudjEuU3RhdGVEZWx0YUgAEisKBnJlc3VtZRgGIAEoCzIZLmZyb250bGluZS52MS5SZXN1bWVNYXRjaEgAEisKBnJlc3VsdBgHIAEoCzIZLmZyb250bGluZS52MS5NYXRjaFJlc3VsdEgAEiwKBWVycm9yGAggASgLMhsuZnJvbnRsaW5lLnYxLlByb3RvY29sRXJyb3JIABIiCgRwaW5nGAkgASgLMhIuZnJvbnRsaW5lLnYxLlBpbmdIABItCgdjb250cm9sGAogASgLMhouZnJvbnRsaW5lLnYxLk1hdGNoQ29udHJvbEgAEisKBnN0YXR1cxgLIAEoCzIZLmZyb250bGluZS52MS5NYXRjaFN0YXR1c0gAQgkKB21lc3NhZ2UiagoLQ2xpZW50SGVsbG8SEAoIcHJvdG9jb2wYASABKA0SEgoKc2ltdWxhdGlvbhgCIAEoCRIUCgxjb250ZW50X2hhc2gYAyABKAkSDQoFdG9rZW4YBCABKAkSEAoIbWF0Y2hfaWQYBSABKAkiSgoLUmVzdW1lTWF0Y2gSKAoFaGVsbG8YASABKAsyGS5mcm9udGxpbmUudjEuQ2xpZW50SGVsbG8SEQoJbGFzdF90aWNrGAIgASgNIh4KDE1hdGNoQ29udHJvbBIOCgZhY3Rpb24YASABKAkiVAoPQ29ubmVjdGlvblN0YXRlEg4KBnBsYXllchgBIAEoDRIRCgljb25uZWN0ZWQYAiABKAgSHgoWcmVjb25uZWN0X3JlbWFpbmluZ19tcxgDIAEoDSKYAQoLTWF0Y2hTdGF0dXMSFQoNcGF1c2VfZW5hYmxlZBgBIAEoCBIOCgZwYXVzZWQYAiABKAgSEwoLcGF1c2Vfdm90ZXMYAyADKA0SMAoJdGVhbW1hdGVzGAQgAygLMh0uZnJvbnRsaW5lLnYxLkNvbm5lY3Rpb25TdGF0ZRIbChN3YWl0aW5nX2Zvcl9wbGF5ZXJzGAUgASgIIhUKBFBpbmcSDQoFbm9uY2UYASABKA0iQwoNUHJvdG9jb2xFcnJvchIMCgRjb2RlGAEgASgJEg8KB21lc3NhZ2UYAiABKAkSEwoLcmVjb3ZlcmFibGUYAyABKAgiGwoDVmVjEgkKAXgYASABKBESCQoBeRgCIAEoESKsAQoFT3JkZXISDAoEa2luZBgBIAEoCRIQCghlbnRpdGllcxgCIAMoDRIOCgZ0YXJnZXQYAyABKA0SIwoIcG9zaXRpb24YBCABKAsyES5mcm9udGxpbmUudjEuVmVjEgwKBHR5cGUYBSABKAkSDgoGcXVldWVkGAYgASgIEg0KBWluZGV4GAcgASgFEiEKBnBvaW50cxgIIAMoCzIRLmZyb250bGluZS52MS5WZWMiQwoKT3JkZXJCYXRjaBIQCghzZXF1ZW5jZRgBIAEoDRIjCgZvcmRlcnMYAiADKAsyEy5mcm9udGxpbmUudjEuT3JkZXIibAoLT3JkZXJSZXN1bHQSDgoGcGxheWVyGAEgASgNEhAKCHNlcXVlbmNlGAIgASgNEg0KBWluZGV4GAMgASgFEhAKCGFjY2VwdGVkGAQgASgIEgwKBGNvZGUYBSABKAkSDAoEdGljaxgGIAEoDSJ6CghNZXRhZGF0YRISCgpzaW11bGF0aW9uGAEgASgJEhAKCHByb3RvY29sGAIgASgNEhQKDGNvbnRlbnRfaGFzaBgDIAEoCRITCgttYXBfdmVyc2lvbhgEIAEoCRIPCgdydWxlc2V0GAUgASgJEgwKBHNlZWQYBiABKAQiJQoIQ29vbGRvd24SCgoCaWQYASABKAkSDQoFdW50aWwYAiABKA0imAEKA0pvYhIMCgR0eXBlGAEgASgJEhAKCHJlc2VhcmNoGAIgASgIEgwKBHBhaWQYAyABKAMSDAoEd29yaxgEIAEoDRIQCghyZXF1aXJlZBgFIAEoDRIOCgZzdXBwbHkYBiABKAUSDwoHc2VydmljZRgHIAEoDRIPCgdzdGFydGVkGAggASgIEhEKCWVtZXJnZW5jeRgJIAEoCCKLAgoHRWNvbm9teRIPCgdjcmVkaXRzGAEgASgDEg4KBmVuZXJneRgCIAEoAxIOCgZzdXBwbHkYAyABKAUSFwoPcmVzZXJ2ZWRfc3VwcGx5GAQgASgFEhYKDnBvd2VyX2NhcGFjaXR5GAUgASgFEhQKDHBvd2VyX2RlbWFuZBgGIAEoBRIMCgR0aWVyGAcgASgFEg4KBmluY29tZRgIIAEoAxIWCg5yZXBhaXJfcmVzZXJ2ZRgJIAEoAxIQCgh1cGdyYWRlcxgKIAMoCRIpCgljb29sZG93bnMYCyADKAsyFi5mcm9udGxpbmUudjEuQ29vbGRvd24SFQoNbGFzdF9zZXF1ZW5jZRgMIAEoDSK4AwoNRW50aXR5UHJpdmF0ZRIKCgJocBgBIAEoAxIOCgZtYXhfaHAYAiABKAMSHwoEam9icxgDIAMoCzIRLmZyb250bGluZS52MS5Kb2ISIwoGb3JkZXJzGAQgAygLMhMuZnJvbnRsaW5lLnYxLk9yZGVyEiAKBXJhbGx5GAUgASgLMhEuZnJvbnRsaW5lLnYxLlZlYxINCgVjYXJnbxgGIAEoAxIMCgRob21lGAcgASgNEgwKBGFtbW8YCCABKAUSEQoJZW5kdXJhbmNlGAkgASgNEg8KB2NoYXJnZXMYCiABKAUSEwoLY2hhcmdlX3dvcmsYCyABKA0SFAoMc2VydmljZV93b3JrGAwgASgNEhIKCmV4cGVyaWVuY2UYDSABKAMSKQoJY29vbGRvd25zGA4gAygLMhYuZnJvbnRsaW5lLnYxLkNvb2xkb3duEhIKCnBhc3NlbmdlcnMYDyADKA0SEQoJY29udGFpbmVyGBAgASgNEhUKDXJlcGVhdF9zb3J0aWUYESABKAgSFAoMYW1idXNoX3JlYWR5GBIgASgIEhYKDm1pc3Npb25fb3JpZ2luGBMgASgJIrgDCgZFbnRpdHkSCgoCaWQYASABKA0SDAoEdHlwZRgCIAEoCRINCgVvd25lchgDIAEoDRIjCghwb3NpdGlvbhgEIAEoCzIRLmZyb250bGluZS52MS5WZWMSDgoGZmFjaW5nGAUgASgFEg4KBmhlYWx0aBgGIAEoBRINCgVzdGF0ZRgHIAEoCRIQCghjb21wbGV0ZRgIIAEoCBIPCgdlbmFibGVkGAkgASgIEg4KBmxhbmRlZBgKIAEoCBIQCghkZXBsb3llZBgLIAEoCBIRCgljb25jZWFsZWQYDCABKAgSEAoIcHJvZ3Jlc3MYDSABKAUSDAoEcmFuaxgOIAEoDRIsCgdwcml2YXRlGA8gASgLMhsuZnJvbnRsaW5lLnYxLkVudGl0eVByaXZhdGUSFQoNdHVycmV0X2ZhY2luZxgQIAEoBRIVCg1jaGFubmVsX3VudGlsGBEgASgNEhIKCm1hcF9vYmplY3QYEiABKA0SFwoPZm9vdHByaW50X3dpZHRoGBMgASgFEhgKEGZvb3RwcmludF9oZWlnaHQYFCABKAUSFgoOZm9vdHByaW50X3R5cGUYFSABKAkisAEKDVBsYXllclN1bW1hcnkSCgoCaWQYASABKA0SDAoEbmFtZRgCIAEoCRIPCgdmYWN0aW9uGAMgASgJEgwKBHRlYW0YBCABKA0SEAoIZGVmZWF0ZWQYBSABKAgSEQoJZGVmZWF0X2F0GAYgASgNEhoKEnN0cmF0ZWdpY19wcm9ncmVzcxgHIAEoBRIWCg5zdXJyZW5kZXJfdm90ZRgIIAEoCBINCgVjb2xvchgJIAEoDSK6AQoKUHJvamVjdGlsZRIKCgJpZBgBIAEoDRINCgVvd25lchgCIAEoDRIOCgZ3ZWFwb24YAyABKAkSIwoIcG9zaXRpb24YBCABKAsyES5mcm9udGxpbmUudjEuVmVjEiEKBmltcGFjdBgFIAEoCzIRLmZyb250bGluZS52MS5WZWMSEQoJaW1wYWN0X2F0GAYgASgNEhUKDWludGVyY2VwdGFibGUYByABKAgSDwoHd2FybmluZxgIIAEoCCJLCgVGaWVsZBIKCgJpZBgBIAEoDRIjCghwb3NpdGlvbhgCIAEoCzIRLmZyb250bGluZS52MS5WZWMSEQoJcmVtYWluaW5nGAMgASgDIkkKB1N0YXRpb24SCgoCaWQYASABKA0SIwoIcG9zaXRpb24YAiABKAsyES5mcm9udGxpbmUudjEuVmVjEg0KBW93bmVyGAMgASgNIq8BCgZNZW1vcnkSCgoCaWQYASABKA0SDAoEdHlwZRgCIAEoCRINCgVvd25lchgDIAEoDRIjCghwb3NpdGlvbhgEIAEoCzIRLmZyb250bGluZS52MS5WZWMSDAoEc2VlbhgFIAEoDRIXCg9mb290cHJpbnRfd2lkdGgYBiABKAUSGAoQZm9vdHByaW50X2hlaWdodBgHIAEoBRIWCg5mb290cHJpbnRfdHlwZRgIIAEoCSKfAQoFRXZlbnQSCgoCaWQYASABKA0SDAoEdGljaxgCIAEoDRIMCgRraW5kGAMgASgJEg0KBW93bmVyGAQgASgNEg4KBmVudGl0eRgFIAEoDRIjCghwb3NpdGlvbhgGIAEoCzIRLmZyb250bGluZS52MS5WZWMSDQoFdmFsdWUYByABKAMSDQoFc2NvcGUYCCABKAkSDAoEdGV4dBgJIAEoCSJdCgdPdXRjb21lEhAKCGZpbmlzaGVkGAEgASgIEgwKBGRyYXcYAiABKAgSFAoMd2lubmluZ190ZWFtGAMgASgNEg4KBnJlYXNvbhgEIAEoCRIMCgR0aWNrGAUgASgNIuAGCg5QbGF5ZXJTbmFwc2hvdBIoCghtZXRhZGF0YRgBIAEoCzIWLmZyb250bGluZS52MS5NZXRhZGF0YRIMCgR0aWNrGAIgASgNEhEKCWNvdW50ZG93bhgDIAEoDRIOCgZwbGF5ZXIYBCABKA0SJgoHZWNvbm9teRgFIAEoCzIVLmZyb250bGluZS52MS5FY29ub215EiwKB3BsYXllcnMYBiADKAsyGy5mcm9udGxpbmUudjEuUGxheWVyU3VtbWFyeRImCghlbnRpdGllcxgHIAMoCzIULmZyb250bGluZS52MS5FbnRpdHkSLQoLcHJvamVjdGlsZXMYCCADKAsyGC5mcm9udGxpbmUudjEuUHJvamVjdGlsZRIjCgZmaWVsZHMYCSADKAsyEy5mcm9udGxpbmUudjEuRmllbGQSJwoIc3RhdGlvbnMYCiADKAsyFS5mcm9udGxpbmUudjEuU3RhdGlvbhIUCghleHBsb3JlZBgLIAMoCEICEAESEwoHdmlzaWJsZRgMIAMoCEICEAESJAoGbWVtb3J5GA0gAygLMhQuZnJvbnRsaW5lLnYxLk1lbW9yeRIjCgZldmVudHMYDiADKAsyEy5mcm9udGxpbmUudjEuRXZlbnQSKgoHcmVzdWx0cxgPIAMoCzIZLmZyb250bGluZS52MS5PcmRlclJlc3VsdBITCgtzaGlwbWVudF9hdBgQIAEoDRImCgdvdXRjb21lGBEgASgLMhUuZnJvbnRsaW5lLnYxLk91dGNvbWUSJgoHc2FsdmFnZRgSIAMoCzIVLmZyb250bGluZS52MS5TYWx2YWdlEiEKBXpvbmVzGBMgAygLMhIuZnJvbnRsaW5lLnYxLlpvbmUSNAoKaW5kaWNhdG9ycxgUIAMoCzIgLmZyb250bGluZS52MS5TdHJ1Y3R1cmVJbmRpY2F0b3ISLgoHbWlzc2lvbhgVIAEoCzIdLmZyb250bGluZS52MS5NaXNzaW9uUHJvZ3Jlc3MSDgoGcnViYmxlGBYgAygNEjAKCHdhcm5pbmdzGBcgAygLMh4uZnJvbnRsaW5lLnYxLk9wZXJhdGlvbldhcm5pbmcSJgoHZGVicmllZhgYIAEoCzIVLmZyb250bGluZS52MS5EZWJyaWVmImoKClN0YXRlRGVsdGESFQoNYmFzZWxpbmVfdGljaxgBIAEoDRIrCgVzdGF0ZRgCIAEoCzIcLmZyb250bGluZS52MS5QbGF5ZXJTbmFwc2hvdBIYChByZW1vdmVkX2VudGl0aWVzGAMgAygNImgKC01hdGNoUmVzdWx0EhAKCG1hdGNoX2lkGAEgASgJEiYKB291dGNvbWUYAiABKAsyFS5mcm9udGxpbmUudjEuT3V0Y29tZRIRCgljb21taXR0ZWQYAyABKAgSDAoEdm9pZBgEIAEoCCJnCgdTYWx2YWdlEgoKAmlkGAEgASgNEg0KBW93bmVyGAIgASgNEiMKCHBvc2l0aW9uGAMgASgLMhEuZnJvbnRsaW5lLnYxLlZlYxINCgV2YWx1ZRgEIAEoAxINCgV1bnRpbBgFIAEoDSJ2CgRab25lEgwKBGtpbmQYASABKAkSDQoFb3duZXIYAiABKA0SIwoIcG9zaXRpb24YAyABKAsyES5mcm9udGxpbmUudjEuVmVjEg4KBnJhZGl1cxgEIAEoBRINCgVzdGFydBgFIAEoDRINCgV1bnRpbBgGIAEoDSJIChJTdHJ1Y3R1cmVJbmRpY2F0b3ISDQoFb3duZXIYASABKA0SIwoIcG9zaXRpb24YAiABKAsyES5mcm9udGxpbmUudjEuVmVjIoYBChFPYmplY3RpdmVQcm9ncmVzcxIKCgJpZBgBIAEoCRIMCgR0ZXh0GAIgASgJEhAKCG9wdGlvbmFsGAMgASgIEg8KB2ZhaWx1cmUYBCABKAgSEAoIY29tcGxldGUYBSABKAgSEAoIcHJvZ3Jlc3MYBiABKA0SEAoIcmVxdWlyZWQYByABKA0i4gEKD01pc3Npb25Qcm9ncmVzcxIKCgJpZBgBIAEoCRINCgV0aXRsZRgCIAEoCRISCgpkaWZmaWN1bHR5GAMgASgJEhIKCmNoZWNrcG9pbnQYBCABKAkSFwoPY2hlY2twb2ludF90aWNrGAUgASgNEjMKCm9iamVjdGl2ZXMYBiADKAsyHy5mcm9udGxpbmUudjEuT2JqZWN0aXZlUHJvZ3Jlc3MSLQoHY29udm95cxgHIAMoCzIcLmZyb250bGluZS52MS5Db252b3lQcm9ncmVzcxIPCgd2ZXJzaW9uGAggASgJIpIBChBPcGVyYXRpb25XYXJuaW5nEgwKBGtpbmQYASABKAkSDQoFb3duZXIYAiABKA0SIwoIcG9zaXRpb24YAyABKAsyES5mcm9udGxpbmUudjEuVmVjEgoKAmF0GAQgASgNEg4KBnNvdXJjZRgFIAEoDRIgCgVleGl0cxgGIAMoCzIRLmZyb250bGluZS52MS5WZWMiqQEKDkNvbnZveVByb2dyZXNzEgoKAmlkGAEgASgJEg4KBmFjdGl2ZRgCIAEoCBIRCgljb21wbGV0ZWQYAyABKAgSDAoEaGVsZBgEIAEoCBIOCgZtb3ZpbmcYBSABKAgSDQoFcm91dGUYBiABKA0SEAoId2F5cG9pbnQYByABKA0SFwoPY291bnRkb3duX3VudGlsGAggASgNEhAKCGFwcHJvdmVkGAkgAygNIm8KDUVjb25vbXlTYW1wbGUSDAoEdGljaxgBIAEoDRIPCgdjcmVkaXRzGAIgASgDEg4KBmluY29tZRgDIAEoAxINCgVzcGVudBgEIAEoAxIOCgZzdXBwbHkYBSABKAUSEAoIc3RhdGlvbnMYBiABKA0iLgoPUHJvZHVjdGlvbkNvdW50EgwKBHR5cGUYASABKAkSDQoFY291bnQYAiABKA0i2QIKD1BsYXllclRlbGVtZXRyeRIOCgZwbGF5ZXIYASABKA0SNQoOdW5pdHNfcHJvZHVjZWQYAiADKAsyHS5mcm9udGxpbmUudjEuUHJvZHVjdGlvbkNvdW50EjwKFWJ1aWxkaW5nc19jb25zdHJ1Y3RlZBgDIAMoCzIdLmZyb250bGluZS52MS5Qcm9kdWN0aW9uQ291bnQSEgoKdW5pdHNfbG9zdBgEIAEoDRIWCg5idWlsZGluZ3NfbG9zdBgFIAEoDRIUCgxyZXBhaXJfc3BlbnQYBiABKAMSFQoNbWlzc2lsZV9zcGVudBgHIAEoAxIaChJpbnRlcmNlcHRvcnNfZmlyZWQYCCABKA0SHQoVc3RhdGlvbl9jb250cm9sX3RpY2tzGAkgASgNEi0KCHRpbWVsaW5lGAogAygLMhsuZnJvbnRsaW5lLnYxLkVjb25vbXlTYW1wbGUisAIKDURlYnJpZWZQbGF5ZXISDgoGcGxheWVyGAEgASgNEgwKBG5hbWUYAiABKAkSDwoHZmFjdGlvbhgDIAEoCRIMCgR0ZWFtGAQgASgNEg0KBWNvbG9yGAUgASgNEhAKCGRlZmVhdGVkGAYgASgIEg8KB2NyZWRpdHMYByABKAMSDgoGaW5jb21lGAggASgDEg0KBXNwZW50GAkgASgDEhIKCmxvc3RfdmFsdWUYCiABKAMSFwoPdW5pdHNfc3Vydml2aW5nGAsgASgNEhwKFHN0cnVjdHVyZXNfc3Vydml2aW5nGAwgASgNEhYKDmV4cGxvcmVkX3RpbGVzGA0gASgNEi4KB21ldHJpY3MYDiABKAsyHS5mcm9udGxpbmUudjEuUGxheWVyVGVsZW1ldHJ5IlYKDERlYnJpZWZFdmVudBIMCgR0aWNrGAEgASgNEgwKBGtpbmQYAiABKAkSDgoGcGxheWVyGAMgASgNEgwKBHR5cGUYBCABKAkSDAoEdGV4dBgFIAEoCSJ7CgdEZWJyaWVmEiwKB3BsYXllcnMYASADKAsyGy5mcm9udGxpbmUudjEuRGVicmllZlBsYXllchIqCgZldmVudHMYAiADKAsyGi5mcm9udGxpbmUudjEuRGVicmllZkV2ZW50EhYKDm9taXR0ZWRfZXZlbnRzGAMgASgNQiRaImZyb250bGluZWNvbW1hbmQvcHJvdG9jb2w7cHJvdG9jb2xiBnByb3RvMw");
var VecSchema = /* @__PURE__ */ messageDesc(file_frontline, 8);
var EntitySchema = /* @__PURE__ */ messageDesc(file_frontline, 17);
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

// src/app/owner-ranges.ts
var record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var uint = (value) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647;
function ownerRanges(entity2, snapshot2) {
  if (entity2.owner !== snapshot2.player || !entity2.private || entity2.private.container || entity2.health <= 0 || entity2.state === "destroyed") return;
  const raw = entity2.private.ranges;
  if (!record(raw) || !uint(raw.sightRadius) || !uint(raw.detectionRadius) || !uint(raw.buildRadius) || typeof raw.airborneSight !== "boolean") return;
  const out = { sightRadius: raw.sightRadius, detectionRadius: raw.detectionRadius, airborneSight: raw.airborneSight, buildRadius: raw.buildRadius };
  const d = raw.interception;
  if (d === void 0 || d === null) return out;
  if (!record(d) || !uint(d.radius) || d.radius === 0 || !uint(d.capacity) || d.capacity === 0 || typeof d.active !== "boolean" || typeof d.ready !== "boolean" || !uint(d.rechargeRequired) || d.rechargeRequired === 0 || !uint(d.rechargeRate) || !uint(d.fireReadyAt) || !Array.isArray(d.assignments)) return out;
  if (d.nextChargeTicks !== void 0 && (!uint(d.nextChargeTicks) || d.nextChargeTicks === 0 || !d.active || d.rechargeRate === 0)) return out;
  if (d.ready && (!d.active || entity2.private.charges <= 0 || d.fireReadyAt > snapshot2.tick)) return out;
  const assignments = [], seen = /* @__PURE__ */ new Set();
  for (const value of d.assignments.slice(0, 64)) {
    if (!record(value) || !uint(value.projectile) || value.projectile === 0 || seen.has(value.projectile) || !uint(value.interceptAt) || value.interceptAt <= snapshot2.tick || !record(value.impact) || !uint(value.impact.x) || !uint(value.impact.y)) continue;
    const projectile = snapshot2.projectiles.find((p) => p.id === value.projectile && p.warning && p.interceptable);
    if (!projectile?.impact || projectile.impact.x !== value.impact.x || projectile.impact.y !== value.impact.y) continue;
    assignments.push({ projectile: value.projectile, impact: { x: value.impact.x, y: value.impact.y }, interceptAt: value.interceptAt });
    seen.add(value.projectile);
  }
  out.interception = { radius: d.radius, capacity: d.capacity, active: d.active, ready: d.ready, rechargeRequired: d.rechargeRequired, rechargeRate: d.rechargeRate, ...d.nextChargeTicks !== void 0 ? { nextChargeTicks: d.nextChargeTicks } : {}, fireReadyAt: d.fireReadyAt, assignments };
  return out;
}

// src/app/actor-status.ts
var EFFECTS = {
  designated: { symbol: "\u25CE", label: "Designated", tone: "critical", priority: 230 },
  disabled: { symbol: "\xD7", label: "Disabled", tone: "critical", priority: 240 },
  sabotage_resistance: { symbol: "R", label: "Sabotage resistant", tone: "benefit", priority: 100 },
  decoy: { symbol: "D", label: "Decoy active", tone: "benefit", priority: 140 },
  disperse: { symbol: "\u2194", label: "Dispersed", tone: "benefit", priority: 110 },
  emergency_power: { symbol: "\u03DF", label: "Emergency power", tone: "benefit", priority: 140 },
  rapid_sortie: { symbol: "\xBB", label: "Rapid sortie", tone: "benefit", priority: 110 },
  recall: { symbol: "\u21A9", label: "Drone recall", tone: "benefit", priority: 150 },
  recovery: { symbol: "+", label: "Recovery order", tone: "benefit", priority: 110 },
  relay: { symbol: "\u2301", label: "Relay boost", tone: "benefit", priority: 110 },
  shieldline: { symbol: "\u25C7", label: "Shieldline", tone: "benefit", priority: 130 },
  hull_down: { symbol: "\u25B1", label: "Hull down", tone: "benefit", priority: 120 },
  temporary: { symbol: "T", label: "Withdrawal", tone: "warning", priority: 150 },
  launch_reveal: { symbol: "!", label: "Launch reveal", tone: "warning", priority: 190 }
};
var CHANNELS = { capture: "Capturing", sabotage: "Sabotaging", designate: "Designating", beacon: "Placing beacon", board: "Boarding", unload: "Unloading", salvage: "Salvaging", sell: "Selling", selling: "Selling", transit: "Transferring" };
var uint2 = (value) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4294967295;
var seconds = (tick, until) => Math.ceil(Math.max(0, until - tick) / 20);
function actorStatus(entity2, snapshot2, catalog2) {
  const out = { badges: [] };
  if (entity2.state === "destroyed" || entity2.health <= 0 || entity2.private?.container && entity2.owner === snapshot2.player) return out;
  const own = entity2.owner === snapshot2.player, unit = catalog2.units.get(entity2.type), building = catalog2.buildings.get(entity2.type);
  const privateState = own ? entity2.private : void 0;
  const ranges = ownerRanges(entity2, snapshot2);
  if (ranges) out.ranges = ranges;
  const add = (id, symbol, label, tone, priority, until) => {
    if (out.badges.some((b) => b.id === id)) return;
    out.badges.push({ id, symbol, label, tone, priority, ...until !== void 0 && until > 0 ? { seconds: seconds(snapshot2.tick, until) } : {} });
  };
  const extension = entity2;
  if (Array.isArray(extension.effects)) for (const effect of extension.effects.slice(0, 32)) {
    if (typeof effect?.kind !== "string" || !uint2(effect.until) || effect.until > 0 && effect.until <= snapshot2.tick) continue;
    const known = EFFECTS[effect.kind];
    if (known) add(effect.kind, known.symbol, known.label, known.tone, known.priority, effect.until);
  }
  if (!entity2.enabled) add("disabled", "\xD7", "Disabled", "critical", 240);
  if (entity2.concealed) add("concealed", "\u25D0", "Concealed", "neutral", 90);
  if (privateState?.ambushReady) add("ambush", "\u25C6", "Ambush ready", "benefit", 130);
  if (entity2.type === "SA.tank" && entity2.deployed) add("hull_down", "\u25B1", "Hull down", "benefit", 120);
  if (own && building && snapshot2.economy && snapshot2.economy.powerDemand > snapshot2.economy.powerCapacity) add("low_power", "\u03DF", "Low power", "warning", 180);
  if (entity2.state === "landing_blocked") add("landing_blocked", "!", "Landing area blocked", "critical", 270);
  if (privateState && building && entity2.state === "service_full") add("service_full", "!", "Aircraft service unavailable", "warning", 250);
  if (entity2.state === "exit_blocked") add("exit_blocked", "!", "Production exit blocked", "warning", 250);
  if (entity2.state === "capture_exit_blocked") add("capture_exit_blocked", "!", "Capture exits blocked", "warning", 250);
  if (entity2.state === "unload_exit_blocked") add("unload_exit_blocked", "!", "Unload exits blocked", "warning", 250);
  if (entity2.state === "repairing") add("repairing", "+", "Repairing", "benefit", 90);
  if (entity2.state === "healing") add("healing", "+", "Healing", "benefit", 90);
  if (privateState && unit?.armor === "air") {
    const emergency = privateState.emergencyTakeoffUntil;
    if (uint2(emergency) && emergency > snapshot2.tick) add("emergency_takeoff", "\u2191", "Emergency takeoff", "critical", 300, emergency);
    else if (entity2.state === "emergency_takeoff") add("emergency_takeoff", "\u2191", "Emergency takeoff", "critical", 300);
    if (privateState.home === 0 && (!entity2.landed || entity2.state === "emergency_takeoff" || uint2(emergency) && emergency > snapshot2.tick)) add("no_home", "!", "No service base", "critical", 280);
    if (!entity2.landed && privateState.orders[0]?.kind === "return") add("return", "\u21A9", "Returning to base", "warning", 170);
    if (entity2.landed && (entity2.state === "servicing" || uint2(privateState.serviceWork) && privateState.serviceWork > 0)) {
      const home = snapshot2.entities.find((value) => value.id === privateState.home && value.owner === snapshot2.player && value.health > 0 && value.complete && (catalog2.buildings.get(value.type)?.service_slots ?? 0) > 0);
      if (home && !home.enabled) add("service_paused", "!", "Service paused: base disabled", "warning", 250);
      else add("servicing", "\u21BB", "Aircraft servicing", "neutral", 160);
    }
  }
  const weapon = catalog2.weapons.get(unit?.weapon ?? building?.weapon ?? "");
  if (privateState) {
    const capacity = weapon?.ammo;
    if (typeof capacity === "number" && Number.isInteger(capacity) && capacity > 0 && capacity <= 64) {
      const current = weapon?.kind === "tactical" ? privateState.charges : privateState.ammo;
      if (uint2(current)) out.ammunition = { label: weapon?.kind === "tactical" ? "Charges" : "Ammo", current, capacity };
    } else if (building?.role === "abm" || entity2.type === "SA.mobile_abm") {
      if (uint2(privateState.charges)) out.ammunition = { label: "Interceptors", current: privateState.charges, ...ranges?.interception ? { capacity: ranges.interception.capacity } : {} };
    }
  }
  const channel = CHANNELS[entity2.state];
  if (channel && uint2(entity2.channelUntil) && entity2.channelUntil > snapshot2.tick) out.channel = { label: channel, progress: Math.max(0, Math.min(1e3, entity2.progress)), seconds: seconds(snapshot2.tick, entity2.channelUntil) };
  out.badges.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  return out;
}

// src/content/labels.ts
var REASONS = {
  ok: "Accepted.",
  indeterminate: "The host will check this when the order executes.",
  insufficient_credits: "Not enough credits.",
  insufficient_energy: "Not enough Command Energy.",
  cooldown: "Still cooling down.",
  queue_full: "The queue is full (one active job plus five waiting).",
  producer_disabled: "The producer is disabled or unpowered.",
  missing_tier: "Requires a higher technology tier.",
  missing_prerequisite: "A prerequisite building is missing.",
  already_researched: "Already researched.",
  already_queued: "Already queued elsewhere.",
  blocked_terrain: "Blocked terrain under the foundation.",
  mandatory_corridor: "Would block a mandatory route.",
  unseen_placement: "Part of the foundation is not currently visible.",
  outside_map: "Outside the battlefield.",
  snap_to_grid: "Placement must align to the tile grid.",
  outside_build_radius: "Outside the 14-tile build radius of an HQ or outpost.",
  overlap: "Overlaps another structure or unit.",
  occupied: "The site is occupied.",
  target_not_visible: "The target is not currently visible.",
  not_controllable: "That unit cannot be commanded.",
  unsupported_command: "Not every selected unit can do that.",
  selection_empty: "Select units first.",
  countdown: "Commands unlock when the opening countdown ends.",
  match_countdown: "Commands unlock when the opening countdown ends.",
  replay_read_only: "Replays are read-only.",
  one_builder_required: "Select one engineering rig.",
  one_producer_required: "Choose one producer.",
  structure_limit: "Structure limit reached.",
  defense_limit: "Defense limit reached (16).",
  unique_limit: "Only one of this structure is allowed.",
  supply_cap: "Army Supply is at its cap.",
  service_capacity: "No aircraft service slot is available.",
  no_service_slot: "No aircraft service slot is available.",
  service_full: "Aircraft service is unavailable. Check free slots and whether the service base is enabled.",
  owned_service_required: "Choose one of your own aircraft service buildings.",
  service_unavailable: "Choose a completed, enabled service building that is not being sold.",
  incompatible_service: "This base cannot service every selected aircraft.",
  aircraft_servicing: "Wait for servicing to finish before changing bases.",
  aircraft_recovering: "Wait for emergency takeoff to finish before changing bases.",
  rebase_not_queueable: "Rebase changes reserved service slots immediately; release Shift and turn off queue mode.",
  takeoff_blocked: "The aircraft cannot take off until the airspace above its pad is clear.",
  invalid_designation: "Choose a visible enemy vehicle or structure within seven tiles.",
  invalid_sabotage: "Choose an adjacent enemy production or tech building.",
  ability_prerequisite: "Requires Tier 2 and an active HQ.",
  unexplored_target: "Choose explored terrain.",
  target_required: "Choose a target.",
  invalid_target_kind: "That target does not fit this command.",
  no_context_command: "No applicable order for that target.",
  targeting_changed: "Selection changed; the order was not sent.",
  command_limit: "Too many orders at once.",
  not_connected: "Reconnect to the host before issuing orders.",
  capture_exit_blocked: "Garrison exits are blocked \u2014 clear space or cancel the capture.",
  landing_blocked: "Landing pads are blocked.",
  exit_blocked: "Production exit is blocked.",
  route_blocked: "No route found.",
  cannot_queue: "This order cannot be queued.",
  selection_limit: "Too many units selected for this order.",
  completed_building_required: "Select a completed building.",
  wrong_research_producer: "Research here is unavailable.",
  unknown_ability: "Unknown ability."
};
function reason(code, fallback) {
  if (!code) return fallback ?? "Unknown result.";
  return REASONS[code] ?? fallback ?? code.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()) + ".";
}

// tests/runtime/actor-status.test.ts
var catalog = new CatalogIndex(JSON.parse(readFileSync(resolve("../pkg/content/rules.json"), "utf8")));
var entity = (patch = {}) => create(EntitySchema, { id: 1, owner: 1, type: "US.fighter", position: create(VecSchema, { x: 8e3, y: 8e3 }), health: 1e3, complete: true, enabled: true, state: "idle", ...patch });
var snapshot = (tick = 100) => create(PlayerSnapshotSchema, { tick, player: 1, economy: { powerCapacity: 10, powerDemand: 30 }, players: [{ id: 1, team: 1 }, { id: 2, team: 1 }, { id: 3, team: 3 }] });
var extended = (patch, effects) => Object.assign(entity(patch), { effects });
test("actor effect deadlines use exact Go ticks including indefinite aura and expire without cooldown guesses", () => {
  const e = extended({ landed: true, private: { cooldowns: [{ id: "decoy", until: 999 }] } }, [{ kind: "disperse", until: 121 }, { kind: "shieldline", until: 0 }, { kind: "relay", until: 100 }]);
  const before = structuredClone(e), a = actorStatus(e, snapshot(), catalog);
  assert.deepEqual(a.badges.map((b) => [b.id, b.seconds]), [["shieldline", void 0], ["disperse", 2]]);
  assert.equal(actorStatus(e, snapshot(120), catalog).badges.find((b) => b.id === "disperse")?.seconds, 1);
  assert.ok(!actorStatus(e, snapshot(121), catalog).badges.some((b) => b.id === "disperse"));
  assert.deepEqual(actorStatus(e, snapshot(), catalog), a);
  assert.deepEqual(e, before);
});
test("only the owner receives magazine, ambush, service and emergency countdown information", () => {
  const e = entity({ private: { ammo: 4, charges: 2, ambushReady: true, home: 0, orders: [{ kind: "return" }] } });
  Object.assign(e.private, { emergencyTakeoffUntil: 141 });
  const own = actorStatus(e, snapshot(), catalog);
  assert.deepEqual(own.ammunition, { label: "Ammo", current: 4, capacity: 6 });
  assert.equal(own.badges.find((b) => b.id === "emergency_takeoff")?.seconds, 3);
  assert.ok(own.badges.some((b) => b.id === "no_home") && own.badges.some((b) => b.id === "return") && own.badges.some((b) => b.id === "ambush"));
  for (const owner of [2, 3]) {
    const foreign = actorStatus({ ...e, owner }, snapshot(), catalog);
    assert.deepEqual(foreign, { badges: [] });
  }
});
test("runtime without new metadata never starts an invented emergency timer or active buff", () => {
  const e = entity({ state: "emergency_takeoff", landed: true, private: { home: 99, cooldowns: [{ id: "rapid_sortie", until: 999 }] } });
  assert.deepEqual(actorStatus(e, snapshot(), catalog).badges, [{ id: "emergency_takeoff", symbol: "\u2191", label: "Emergency takeoff", tone: "critical", priority: 300 }]);
  assert.deepEqual(actorStatus(e, snapshot(700), catalog).badges, actorStatus(e, snapshot(), catalog).badges);
});
test("a retained Return order does not label a landed aircraft as still returning", () => {
  const e = entity({ landed: true, state: "servicing", private: { home: 5, orders: [{ kind: "return" }] } }), status = actorStatus(e, snapshot(), catalog);
  assert.ok(status.badges.some((b) => b.id === "servicing"));
  assert.ok(!status.badges.some((b) => b.id === "return"));
  assert.ok(!actorStatus({ ...e, state: "landed" }, snapshot(), catalog).badges.some((b) => b.id === "servicing" || b.id === "return"));
});
test("known public effects remain visible on foreign authorized actors without private economy", () => {
  const e = extended({ owner: 3, type: "SA.tank", deployed: true }, [{ kind: "designated", until: 160 }, { kind: "launch_reveal", until: 150 }, { kind: "hull_down", until: 0 }]);
  assert.deepEqual(actorStatus(e, snapshot(), catalog).badges.map((b) => b.id), ["designated", "launch_reveal", "hull_down"]);
  const building = extended({ owner: 3, type: "factory", enabled: false }, [{ kind: "disabled", until: 141 }]);
  const badges = actorStatus(building, snapshot(), catalog).badges;
  assert.equal(badges.length, 1);
  assert.equal(badges[0].seconds, 3);
  assert.ok(!badges.some((b) => b.id === "low_power"));
});
test("channel progress and countdown come from Go state, and cancellation removes them", () => {
  const e = entity({ type: "US.engineer", state: "capture", channelUntil: 145, progress: 370 });
  assert.deepEqual(actorStatus(e, snapshot(), catalog).channel, { label: "Capturing", progress: 370, seconds: 3 });
  assert.equal(actorStatus({ ...e, state: "idle" }, snapshot(), catalog).channel, void 0);
  assert.equal(actorStatus(e, snapshot(145), catalog).channel, void 0);
  assert.equal(actorStatus({ ...e, state: "capture_exit_blocked" }, snapshot(), catalog).badges[0].id, "capture_exit_blocked");
});
test("charges use the actual Go catalog while ABM count does not invent a capacity", () => {
  const launcher = entity({ type: "IR.launcher", private: { charges: 1, ammo: 99 } });
  assert.deepEqual(actorStatus(launcher, snapshot(), catalog).ammunition, { label: "Charges", current: 1, capacity: 2 });
  const abm = entity({ type: "SA.mobile_abm", private: { charges: 3 } });
  assert.deepEqual(actorStatus(abm, snapshot(), catalog).ammunition, { label: "Interceptors", current: 3 });
});
test("unknown/malformed/internal effects and contained or destroyed actors have no labels", () => {
  const e = Object.assign(entity(), { effects: [{ kind: "exit_lock", until: 200 }, { kind: "future_private", until: 200 }, { kind: "decoy", until: -1 }, { kind: "relay", until: Infinity }, { kind: "disperse", until: "300" }] });
  assert.deepEqual(actorStatus(e, snapshot(), catalog), { badges: [] });
  for (const patch of [{ state: "destroyed" }, { health: 0 }, { private: { container: 55 } }]) assert.deepEqual(actorStatus(entity({ ...patch, enabled: false }), snapshot(), catalog), { badges: [] });
});
test("air production service wait is an owner-only unavailable badge, not a guessed capacity count", () => {
  const own = entity({ type: "US.airfield", state: "service_full", private: { jobs: [{ type: "US.fighter", started: true, service: 9 }] } });
  assert.equal(actorStatus(own, snapshot(), catalog).badges.find((b) => b.id === "service_full")?.label, "Aircraft service unavailable");
  for (const owner of [2, 3]) assert.ok(!actorStatus({ ...own, owner }, snapshot(), catalog).badges.some((b) => b.id === "service_full"));
  assert.ok(!actorStatus({ ...own, state: "producing" }, snapshot(), catalog).badges.some((b) => b.id === "service_full"));
  assert.equal(reason("service_full"), "Aircraft service is unavailable. Check free slots and whether the service base is enabled.");
});
test("only the active Return order describes current return flight", () => {
  for (const head of ["move", "attack", "unload"]) {
    const e = entity({ landed: false, private: { home: 5, orders: [{ kind: head }, { kind: "return" }] } });
    assert.ok(!actorStatus(e, snapshot(), catalog).badges.some((b) => b.id === "return"), head);
  }
  const returning = entity({ landed: false, private: { home: 5, orders: [{ kind: "return" }, { kind: "attack" }] } });
  assert.ok(actorStatus(returning, snapshot(), catalog).badges.some((b) => b.id === "return"));
});
test("current owned inactive home distinguishes paused service from low power and unknown home data", () => {
  const aircraft = entity({ landed: true, state: "servicing", private: { home: 5, serviceWork: 300, orders: [{ kind: "return" }] } });
  const home = entity({ id: 5, type: "US.airfield", enabled: false }), s = snapshot();
  s.entities = [aircraft, home];
  const paused = actorStatus(aircraft, s, catalog);
  assert.equal(paused.badges.find((b) => b.id === "service_paused")?.label, "Service paused: base disabled");
  assert.ok(!paused.badges.some((b) => b.id === "servicing"));
  for (const replacement of [{ ...home, enabled: true }, { ...home, owner: 2 }, { ...home, health: 0 }, { ...home, type: "hq" }]) {
    s.entities = [aircraft, replacement];
    const status = actorStatus(aircraft, s, catalog);
    assert.ok(!status.badges.some((b) => b.id === "service_paused"));
    assert.ok(status.badges.some((b) => b.id === "servicing"));
  }
  s.entities = [aircraft];
  assert.ok(!actorStatus(aircraft, s, catalog).badges.some((b) => b.id === "service_paused"));
  s.entities = [home];
  assert.ok(!actorStatus({ ...aircraft, owner: 2 }, s, catalog).badges.some((b) => b.id === "service_paused" || b.id === "servicing"));
});
test("grounded emergency no-home warning remains distinct from takeoff deadline and airborne endurance", () => {
  const e = entity({ landed: true, state: "emergency_takeoff", private: { home: 0, endurance: 1200 } });
  Object.assign(e.private, { emergencyTakeoffUntil: 140 });
  const a = actorStatus(e, snapshot(), catalog);
  assert.equal(a.badges.find((b) => b.id === "emergency_takeoff")?.seconds, 2);
  assert.ok(a.badges.some((b) => b.id === "no_home"));
  assert.equal(a.badges.find((b) => b.id === "no_home")?.seconds, void 0);
  assert.ok(!actorStatus({ ...e, private: { ...e.private, home: 5 } }, snapshot(), catalog).badges.some((b) => b.id === "no_home"));
  const airborne = { ...e, landed: false, state: "flying", private: { ...e.private, emergencyTakeoffUntil: 0 } };
  assert.ok(actorStatus(airborne, snapshot(), catalog).badges.some((b) => b.id === "no_home"));
});
